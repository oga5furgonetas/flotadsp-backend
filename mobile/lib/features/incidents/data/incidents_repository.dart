import '../../../core/network/api_client.dart';
import '../domain/incident.dart';

/// Acceso a las incidencias desde el backend real.
class IncidentsRepository {
  const IncidentsRepository(this._client);
  final ApiClient _client;

  Future<List<Incident>> all() async {
    final res = await _client.get<List<dynamic>>('/incidents');
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => Incident.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Crea una incidencia (`POST /incidents`).
  Future<void> create({
    required String vehicleId,
    required String description,
    String title = '',
    String severity = 'leve',
  }) async {
    await _client.post('/incidents', data: {
      'vehicle_id': vehicleId,
      'title': title,
      'description': description,
      'severity': severity,
    });
  }
}
