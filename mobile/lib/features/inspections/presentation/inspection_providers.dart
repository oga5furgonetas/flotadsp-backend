import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/inspection_repository.dart';
import '../domain/inspection.dart';
import '../domain/inspection_detail.dart';

final inspectionRepositoryProvider = Provider<InspectionRepository>(
  (ref) => InspectionRepository(ref.watch(apiClientProvider)),
);

/// Inspecciones de un vehículo (por id).
final vehicleInspectionsProvider =
    FutureProvider.autoDispose.family<List<InspectionSummary>, String>(
  (ref, vehicleId) => ref.watch(inspectionRepositoryProvider).forVehicle(vehicleId),
);

/// Detalle completo de una inspección (por id).
final inspectionDetailProvider =
    FutureProvider.autoDispose.family<InspectionDetail, String>(
  (ref, id) => ref.watch(inspectionRepositoryProvider).byId(id),
);

/// Centro seleccionado en Revisión Rápida.
final reviewCenterProvider = StateProvider<String>((ref) => 'Todos');

/// Cola de Revisión Rápida del centro seleccionado.
final reviewQueueProvider = FutureProvider.autoDispose<List<InspectionDetail>>((ref) {
  final center = ref.watch(reviewCenterProvider);
  return ref.watch(inspectionRepositoryProvider).reviewQueue(center: center);
});
