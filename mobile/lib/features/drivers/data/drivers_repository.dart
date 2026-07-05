import '../../../core/network/api_client.dart';
import '../domain/driver_rank.dart';

/// Acceso a los conductores desde el backend real.
class DriversRepository {
  const DriversRepository(this._client);
  final ApiClient _client;

  /// Ranking de conductores por puntuación (mejores primero).
  Future<List<DriverRank>> ranking() async {
    final res = await _client.get<dynamic>('/drivers/ranking');
    final data = res.data;
    final list = data is List ? data : (data is Map ? (data['ranking'] ?? data['drivers']) : null);
    if (list is! List) return const [];
    final out = list
        .whereType<Map>()
        .map((e) => DriverRank.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    out.sort((a, b) => b.score.compareTo(a.score));
    return out;
  }
}
