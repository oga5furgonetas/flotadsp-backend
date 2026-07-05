import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/inspection_repository.dart';
import '../domain/inspection.dart';
import '../domain/inspection_detail.dart';

final inspectionRepositoryProvider = Provider<InspectionRepository>(
  (ref) => InspectionRepository(ref.watch(apiClientProvider)),
);

/// Inspecciones de un vehículo (por id). `family` para cachear por vehículo.
final vehicleInspectionsProvider =
    FutureProvider.autoDispose.family<List<InspectionSummary>, String>(
  (ref, vehicleId) => ref.watch(inspectionRepositoryProvider).forVehicle(vehicleId),
);

/// Detalle de una inspección concreta (fotos + daños).
final inspectionDetailProvider =
    FutureProvider.autoDispose.family<InspectionDetail, String>(
  (ref, id) => ref.watch(inspectionRepositoryProvider).byId(id),
);

/// Lista de URLs con la versión anotada de las fotos. Puede venir vacía si
/// aún no se ha generado; en ese caso la UI muestra solo las originales.
final inspectionAnnotatedProvider =
    FutureProvider.autoDispose.family<List<String>, String>(
  (ref, id) => ref.watch(inspectionRepositoryProvider).annotatedPhotoUrls(id),
);
