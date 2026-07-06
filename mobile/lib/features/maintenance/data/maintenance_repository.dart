import '../../../core/network/api_client.dart';
import '../domain/maintenance_alert.dart';

/// Avisos de mantenimiento de toda la flota (`GET /alerts/maintenance`).
class MaintenanceRepository {
  const MaintenanceRepository(this._client);
  final ApiClient _client;

  Future<List<MaintenanceAlert>> alerts() async {
    final res = await _client.get<List<dynamic>>('/alerts/maintenance');
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => MaintenanceAlert.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}
