/// Configuración global de la app. Los valores se pueden sobreescribir en
/// compilación con `--dart-define` (ver `.env.example`), sin tocar código.
class AppConfig {
  const AppConfig._();

  /// Base del backend real de FlotaDSP. Todos los endpoints cuelgan de aquí.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://flotadsp-backend.fly.dev/api',
  );

  /// Nombre visible de la app.
  static const String appName = 'FlotaDSP';

  /// Timeouts de red.
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// Reintentos automáticos ante fallos de red transitorios (solo peticiones
  /// idempotentes: GET).
  static const int maxNetworkRetries = 2;

  /// `true` en compilaciones de release: silencia los logs de desarrollo.
  static const bool isRelease = bool.fromEnvironment('dart.vm.product');
}
