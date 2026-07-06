import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/damage_ledger.dart';
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

  // ─────────────────────── Acciones (escritura) ───────────────────────

  /// Actualiza el kilometraje (`POST /vehicles/{id}/mileage`).
  Future<void> updateMileage(String id, int km) async {
    await _client.post('/vehicles/$id/mileage', data: {'km': km});
  }

  /// Lee el cuentakilómetros de una foto con IA (no guarda; el usuario confirma).
  Future<OdometerRead> readOdometerPhoto(String id, List<int> bytes, String filename) async {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final res = await _client.postForm<Map<String, dynamic>>('/vehicles/$id/odometer-photo', form);
    return OdometerRead.fromJson(res.data ?? const {});
  }

  /// Registra un cambio de mantenimiento. `kind`: oil | ruedas | pastillas.
  /// El aceite tiene endpoint propio; el resto van por `/maintenance/{kind}/change`.
  Future<void> registerMaintenance(
    String id,
    String kind, {
    required int km,
    int? intervalKm,
    int? warningBeforeKm,
  }) async {
    final body = <String, dynamic>{
      'km': km,
      'interval_km': ?intervalKm,
      'warning_before_km': ?warningBeforeKm,
    };
    final path = kind == 'oil'
        ? '/vehicles/$id/oil/change'
        : '/vehicles/$id/maintenance/$kind/change';
    await _client.post(path, data: body);
  }

  /// Edita campos del vehículo (`PATCH /vehicles/{id}`). Solo campos de la
  /// whitelist del backend; los desconocidos se descartan en silencio.
  Future<void> patchVehicle(String id, Map<String, dynamic> fields) async {
    await _client.patch('/vehicles/$id', data: fields);
  }

  /// Sube un documento del vehículo (`POST /vehicles/{id}/documents`).
  Future<VehicleDocument> uploadDocument(
    String id,
    String docType,
    List<int> bytes,
    String filename,
  ) async {
    final form = FormData.fromMap({
      'doc_type': docType,
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final res = await _client.postForm<Map<String, dynamic>>('/vehicles/$id/documents', form);
    return VehicleDocument.fromJson(res.data ?? const {});
  }

  /// Borra un documento (`DELETE /vehicles/{id}/documents/{docId}`).
  Future<void> deleteDocument(String id, String docId) async {
    await _client.delete('/vehicles/$id/documents/$docId');
  }

  /// Ledger de daños (gemelo digital): abiertos + reparados.
  Future<DamageLedger> damageLedger(String id) async {
    final res = await _client.get<Map<String, dynamic>>('/vehicles/$id/damage-ledger');
    return DamageLedger.fromJson(res.data ?? const {});
  }
}
