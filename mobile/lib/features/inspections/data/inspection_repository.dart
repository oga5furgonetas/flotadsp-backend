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

  /// Detalle completo de una inspección (fotos, daños, observaciones…).
  Future<InspectionDetail> byId(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/inspections/$id');
    return InspectionDetail.fromJson(res.data ?? const {});
  }

  /// URLs de las fotos con anotaciones (cajas / máscaras de daños dibujadas).
  /// Devuelve lista vacía si el endpoint no existe o no hay anotaciones.
  Future<List<String>> annotatedPhotoUrls(String id) async {
    final res = await _client.get<dynamic>('/inspections/$id/annotated');
    final data = res.data;
    final out = <String>[];

    void addFrom(Object? v) {
      if (v is String && v.isNotEmpty) {
        out.add(v);
      } else if (v is Map) {
        final u = v['url'] ?? v['annotated_url'] ?? v['path'] ?? v['image'];
        if (u is String && u.isNotEmpty) out.add(u);
      }
    }

    if (data is List) {
      for (final e in data) {
        addFrom(e);
      }
    } else if (data is Map) {
      final ps = data['photos'] ?? data['urls'] ?? data['images'] ?? data['annotated'];
      if (ps is List) {
        for (final e in ps) {
          addFrom(e);
        }
      } else if (data['url'] is String) {
        out.add(data['url'] as String);
      }
    }
    return out;
  }

  /// Marca una inspección como revisada (o vuelve a "pendiente") y añade notas
  /// administrativas opcionales. Backend: `PATCH /inspections/{id}` con
  /// `{reviewed, admin_notes}`. Si tu backend usa otro path/verbo, cambia solo
  /// esta línea.
  Future<void> markReviewed(
    String id, {
    required bool reviewed,
    String? adminNotes,
  }) async {
    await _client.patch<dynamic>(
      '/inspections/$id',
      data: <String, dynamic>{
        'reviewed': reviewed,
        'admin_notes': ?adminNotes,
      },
    );
  }
}
