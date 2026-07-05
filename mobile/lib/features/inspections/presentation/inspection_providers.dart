import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/inspection_repository.dart';
import '../domain/inspection.dart';

final inspectionRepositoryProvider = Provider<InspectionRepository>(
  (ref) => InspectionRepository(ref.watch(apiClientProvider)),
);

/// Inspecciones de un vehículo (por id). `family` para cachear por vehículo.
final vehicleInspectionsProvider =
    FutureProvider.autoDispose.family<List<InspectionSummary>, String>(
  (ref, vehicleId) => ref.watch(inspectionRepositoryProvider).forVehicle(vehicleId),
);
