import '../../../core/network/api_client.dart';
import '../domain/vehicle.dart';

/// Acceso a la flota desde el backend real.
class FleetRepository {
  const FleetRepository(this._client);
  final ApiClient _client;

  /// Lista de vehículos. `center` opcional: 'Todos'/null = toda la org.
  Future<List<Vehicle>> fetchVehicles({String? center}) async {
    final res = await _client.get<List<dynamic>>(
      '/vehicles',
      query: (center != null && center != 'Todos') ? {'center': center} : null,
    );
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => Vehicle.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}
