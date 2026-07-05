import '../../../core/network/api_client.dart';
import '../domain/dashboard_stats.dart';

/// Acceso a las estadísticas del dashboard desde el backend real.
class DashboardRepository {
  const DashboardRepository(this._client);
  final ApiClient _client;

  Future<DashboardStats> fetch() async {
    final res = await _client.get<Map<String, dynamic>>('/stats/dashboard');
    return DashboardStats.fromJson(res.data ?? const {});
  }
}
