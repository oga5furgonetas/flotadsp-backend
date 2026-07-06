import '../../../core/network/api_client.dart';
import '../domain/driver_profile.dart';
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

  /// Fichas completas de los conductores (`GET /drivers`).
  Future<List<DriverProfile>> all() async {
    final res = await _client.get<List<dynamic>>('/drivers');
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => DriverProfile.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Edita un conductor (`PATCH /drivers/{id}`). Solo campos de la whitelist.
  Future<void> update(String id, Map<String, dynamic> fields) async {
    await _client.patch('/drivers/$id', data: fields);
  }
}
