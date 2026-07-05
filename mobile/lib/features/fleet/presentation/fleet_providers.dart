import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/fleet_repository.dart';
import '../domain/vehicle.dart';

final fleetRepositoryProvider = Provider<FleetRepository>(
  (ref) => FleetRepository(ref.watch(apiClientProvider)),
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
