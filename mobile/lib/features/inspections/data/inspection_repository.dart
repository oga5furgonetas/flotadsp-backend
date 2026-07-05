import '../../../core/network/api_client.dart';
import '../domain/inspection.dart';
import '../domain/inspection_detail.dart';

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

  /// Detalle completo de una inspección (fotos, daños, resumen…).
  Future<InspectionDetail> byId(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/inspections/$id');
    return InspectionDetail.fromJson(res.data ?? const {});
  }

  /// Cola de Revisión Rápida: inspecciones pendientes de revisar, ya
  /// enriquecidas con matrícula, conductor, fotos y daños. `center` opcional.
  Future<List<InspectionDetail>> reviewQueue({String? center}) async {
    final res = await _client.get<Map<String, dynamic>>(
      '/inspections/review-queue',
      query: (center != null && center != 'Todos') ? {'center': center} : null,
    );
    final queue = (res.data?['queue'] as List?) ?? const [];
    return queue
        .whereType<Map>()
        .map((e) => InspectionDetail.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Marca una inspección como revisada (sale de la cola de Revisión Rápida).
  /// El backend expone `POST /inspections/{id}/mark-reviewed` (sin cuerpo).
  Future<void> markReviewed(String id) async {
    await _client.post<dynamic>('/inspections/$id/mark-reviewed');
  }
}
