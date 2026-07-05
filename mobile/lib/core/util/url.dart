import '../config/app_config.dart';

/// Resuelve una ruta de imagen del backend a una URL absoluta.
/// Acepta URLs completas (se devuelven tal cual) y rutas relativas
/// (se anteponen esquema+host del backend, sin el segmento `/api`).
String resolveImageUrl(String? path) {
  if (path == null || path.isEmpty) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  final u = Uri.parse(AppConfig.apiBaseUrl);
  final host = u.hasPort ? '${u.scheme}://${u.host}:${u.port}' : '${u.scheme}://${u.host}';
  return host + (path.startsWith('/') ? path : '/$path');
}
