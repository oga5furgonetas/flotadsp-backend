/// Errores de red/servidor tipados, con un mensaje ya listo para mostrar al
/// usuario. Aísla la UI de los detalles de Dio.
sealed class ApiException implements Exception {
  const ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Sin conexión / DNS / host inalcanzable.
class NetworkException extends ApiException {
  const NetworkException([super.message = 'Sin conexión. Revisa tu red e inténtalo de nuevo.']);
}

/// La petición superó el tiempo de espera.
class TimeoutException extends ApiException {
  const TimeoutException([super.message = 'La conexión ha tardado demasiado. Inténtalo de nuevo.']);
}

/// 401/403: sesión inválida o sin permisos.
class UnauthorizedException extends ApiException {
  const UnauthorizedException([super.message = 'Tu sesión ha caducado. Vuelve a iniciar sesión.']);
}

/// 400/404/409… con un mensaje del backend.
class BadRequestException extends ApiException {
  const BadRequestException(super.message);
}

/// 5xx u otros errores del servidor.
class ServerException extends ApiException {
  const ServerException([super.message = 'Error del servidor. Inténtalo en unos minutos.']);
}
