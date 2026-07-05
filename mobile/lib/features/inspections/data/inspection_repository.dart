import '../../../core/network/api_client.dart';
import '../domain/inspection.dart';

/// Acceso a las inspecciones desde el backend real.
class InspectionRepository {
  const InspectionRepository(this._client);
  final ApiClient _client;

  /// Historial de inspecciones de un vehículo (más recientes primero).
  Future<List<InspectionSummary>> forVehicle(String vehicleId) async {
    final res = await _client.get<List<dynamic>>('/inspections/vehicle/$vehicleId');
    final data = res.data ?? const [];
    return data
        .whereType<Map>()
        .map((e) => InspectionSummary.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}
