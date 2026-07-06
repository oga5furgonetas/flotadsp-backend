// Los campos son privados y los parámetros con nombre no pueden serlo, así que
// no se pueden usar "initializing formals" aquí.
// ignore_for_file: prefer_initializing_formals
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Cliente HTTP central de la app: base URL, timeouts, token Bearer automático,
/// reintentos de red y mapeo de errores a [ApiException]. Toda petición pasa
/// por aquí (los repositorios NO usan Dio directamente).
class ApiClient {
  ApiClient({required TokenStorage storage, VoidCallback? onUnauthorized})
      : _storage = storage,
        _onUnauthorized = onUnauthorized {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        headers: {'Content-Type': 'application/json'},
      ),
    );
    _dio.interceptors.add(_authInterceptor());
    _dio.interceptors.add(_retryInterceptor());
    if (!AppConfig.isRelease) {
      _dio.interceptors.add(LogInterceptor(requestBody: true, responseBody: false));
    }
  }

  late final Dio _dio;
  final TokenStorage _storage;
  final VoidCallback? _onUnauthorized;

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? query}) =>
      _guard(() => _dio.get<T>(path, queryParameters: query));

  Future<Response<T>> post<T>(String path, {Object? data}) =>
      _guard(() => _dio.post<T>(path, data: data));

  /// POST multipart (subida de archivos: documentos, foto de cuentakm).
  Future<Response<T>> postForm<T>(String path, FormData data) => _guard(
        () => _dio.post<T>(path, data: data, options: Options(contentType: 'multipart/form-data')),
      );

  Future<Response<T>> patch<T>(String path, {Object? data}) =>
      _guard(() => _dio.patch<T>(path, data: data));

  Future<Response<T>> delete<T>(String path, {Object? data}) =>
      _guard(() => _dio.delete<T>(path, data: data));

  // Añade el token a cada petición y detecta la sesión caducada.
  Interceptor _authInterceptor() {
    return InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.readToken();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) {
        if (e.response?.statusCode == 401) {
          _onUnauthorized?.call();
        }
        handler.next(e);
      },
    );
  }

  // Reintenta SOLO peticiones idempotentes (GET) ante fallos de red transitorios.
  Interceptor _retryInterceptor() {
    return InterceptorsWrapper(
      onError: (e, handler) async {
        final isGet = (e.requestOptions.method).toUpperCase() == 'GET';
        final retries = (e.requestOptions.extra['retries'] as int?) ?? 0;
        if (isGet && _isTransient(e) && retries < AppConfig.maxNetworkRetries) {
          await Future<void>.delayed(Duration(milliseconds: 400 * (retries + 1)));
          final opts = e.requestOptions..extra['retries'] = retries + 1;
          try {
            final res = await _dio.fetch<dynamic>(opts);
            return handler.resolve(res);
          } catch (_) {
            return handler.next(e);
          }
        }
        handler.next(e);
      },
    );
  }

  bool _isTransient(DioException e) =>
      e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout ||
      (e.response?.statusCode != null && e.response!.statusCode! >= 500);

  Future<Response<T>> _guard<T>(Future<Response<T>> Function() run) async {
    try {
      return await run();
    } on DioException catch (e) {
      throw _map(e);
    }
  }

  ApiException _map(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const TimeoutException();
      case DioExceptionType.connectionError:
        return const NetworkException();
      default:
        final code = e.response?.statusCode;
        if (code == 401 || code == 403) return const UnauthorizedException();
        if (code != null && code >= 500) return const ServerException();
        final detail = _detail(e.response?.data);
        return BadRequestException(detail ?? 'No se pudo completar la operación.');
    }
  }

  String? _detail(Object? data) {
    if (data is Map && data['detail'] is String) return data['detail'] as String;
    return null;
  }
}
