import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/fleet_repository.dart';
import '../domain/damage_ledger.dart';
import '../domain/vehicle.dart';
import '../domain/vehicle_detail.dart';

final fleetRepositoryProvider = Provider<FleetRepository>(
  (ref) => FleetRepository(ref.watch(apiClientProvider)),
);

/// Ficha completa del vehículo (datos frescos del backend por id).
final vehicleByIdProvider = FutureProvider.autoDispose.family<Vehicle, String>(
  (ref, id) => ref.watch(fleetRepositoryProvider).byId(id),
);

/// Mantenimiento (aceite/ruedas/pastillas + predicción) del vehículo.
final vehicleMaintenanceProvider =
    FutureProvider.autoDispose.family<MaintenanceInfo, String>(
  (ref, id) => ref.watch(fleetRepositoryProvider).maintenance(id),
);

/// Documentos del vehículo.
final vehicleDocumentsProvider =
    FutureProvider.autoDispose.family<List<VehicleDocument>, String>(
  (ref, id) => ref.watch(fleetRepositoryProvider).documents(id),
);

/// Conductor asignado actualmente al vehículo (o null).
final vehicleDriverProvider =
    FutureProvider.autoDispose.family<AssignedDriver?, String>(
  (ref, id) => ref.watch(fleetRepositoryProvider).assignedDriver(id),
);

/// Ledger de daños del vehículo (gemelo digital).
final vehicleLedgerProvider =
    FutureProvider.autoDispose.family<DamageLedger, String>(
  (ref, id) => ref.watch(fleetRepositoryProvider).damageLedger(id),
);

/// Centro seleccionado en el filtro ('Todos' por defecto).
final fleetCenterProvider = StateProvider<String>((ref) => 'Todos');

/// Texto de búsqueda (matrícula/marca/modelo).
final fleetSearchProvider = StateProvider<String>((ref) => '');

/// Vehículos del centro seleccionado (se refresca al cambiar el centro).
final vehiclesProvider = FutureProvider.autoDispose<List<Vehicle>>((ref) {
  final center = ref.watch(fleetCenterProvider);
  return ref.watch(fleetRepositoryProvider).fetchVehicles(center: center);
});

/// Vehículos ya filtrados por el texto de búsqueda (sobre los del centro).
final filteredVehiclesProvider = Provider.autoDispose<AsyncValue<List<Vehicle>>>((ref) {
  final async = ref.watch(vehiclesProvider);
  final q = ref.watch(fleetSearchProvider).trim().toLowerCase();
  return async.whenData((list) {
    if (q.isEmpty) return list;
    return list
        .where((v) =>
            v.licensePlate.toLowerCase().contains(q) ||
            v.brand.toLowerCase().contains(q) ||
            v.model.toLowerCase().contains(q))
        .toList();
  });
});
