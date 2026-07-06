import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/fleet/domain/vehicle.dart';
import 'package:flotadsp_admin/features/fleet/domain/vehicle_detail.dart';
import 'package:flotadsp_admin/features/fleet/presentation/fleet_providers.dart';
import 'package:flotadsp_admin/features/fleet/presentation/vehicle_detail_screen.dart';
import 'package:flotadsp_admin/features/inspections/domain/inspection.dart';
import 'package:flotadsp_admin/features/inspections/presentation/inspection_providers.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('La ficha muestra VIN, datos y mantenimiento reales', (tester) async {
    // Ventana alta para que el ListView construya todas las secciones.
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    const vehicle = Vehicle(
      id: 'v1',
      licensePlate: '1234 ABC',
      brand: 'Toyota',
      model: 'Proace',
      status: 'active',
      color: 'Blanco',
      year: 2022,
      vin: 'VF1ABCDE123456789',
      center: 'OGA5',
      mileage: 84000,
      itvDate: '2027-01-01',
      fuelType: 'diesel',
    );

    const maintenance = MaintenanceInfo(
      mileage: 84000,
      bagsRemaining: 12,
      kmPerDay: 120,
      oil: MaintItem(
        lastChangeKm: 80000,
        intervalKm: 15000,
        warningBeforeKm: 2500,
        kmUntilChange: 11000,
        nextChangeAtKm: 95000,
        overdue: false,
        warning: false,
        daysLeftEstimate: 91,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          vehicleByIdProvider.overrideWith((ref, id) async => vehicle),
          vehicleMaintenanceProvider.overrideWith((ref, id) async => maintenance),
          vehicleDocumentsProvider.overrideWith((ref, id) async => const <VehicleDocument>[]),
          vehicleDriverProvider.overrideWith((ref, id) async => null),
          vehicleInspectionsProvider.overrideWith((ref, id) async => const <InspectionSummary>[]),
        ],
        child: MaterialApp(
          // La ficha usa la extensión AppColors: sin el tema real, sería nula.
          theme: AppTheme.light,
          home: const VehicleDetailScreen(vehicleId: 'v1', vehicle: vehicle),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('VF1ABCDE123456789'), findsOneWidget); // VIN
    expect(find.text('Datos del vehículo'), findsOneWidget);
    expect(find.text('Mantenimiento'), findsOneWidget);
    // "Aceite" aparece en la fila de estado y en el chip de "registrar cambio".
    expect(find.text('Aceite'), findsWidgets);
    expect(find.text('Actualizar km'), findsOneWidget); // acción de km presente
  });
}
