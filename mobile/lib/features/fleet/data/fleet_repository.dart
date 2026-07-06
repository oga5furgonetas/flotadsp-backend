import '../../../core/network/api_client.dart';
import '../domain/vehicle.dart';
import '../domain/vehicle_detail.dart';

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

  /// Ficha completa de un vehículo (`GET /vehicles/{id}`).
  Future<Vehicle> byId(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/vehicles/$id');
    return Vehicle.fromJson(res.data ?? const {});
  }

  /// Mantenimiento (aceite, ruedas, pastillas) + predicción por km/día.
  Future<MaintenanceInfo> maintenance(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/vehicles/$id/maintenance');
    return MaintenanceInfo.fromJson(res.data ?? const {});
  }

  /// Documentos del vehículo (permisos de circulación, seguros, ITV…).
  Future<List<VehicleDocument>> documents(String id) async {
    final res = await _client.get<List<dynamic>>('/vehicles/$id/documents');
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => VehicleDocument.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Conductor asignado actualmente (o null si no hay).
  Future<AssignedDriver?> assignedDriver(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/vehicles/$id/driver');
    final d = res.data?['driver'];
    if (d is Map) return AssignedDriver.fromJson(Map<String, dynamic>.from(d));
    return null;
  }
}
