import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/fleet/domain/damage_ledger.dart';
import 'package:flotadsp_admin/features/fleet/presentation/body_status_screen.dart';
import 'package:flotadsp_admin/features/fleet/presentation/fleet_providers.dart';

void main() {
  testWidgets('La carrocería lista daños abiertos y reparados reales', (tester) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    const ledger = DamageLedger(
      open: [
        DamageEntry(
          panel: 'puerta_delantera_izquierda',
          part: 'puerta delantera izquierda',
          severity: 'grave',
          status: 'open',
          firstSeen: '2026-05-01',
        ),
      ],
      repaired: [
        DamageEntry(
          panel: 'paragolpes_trasero',
          part: 'paragolpes trasero',
          severity: 'leve',
          status: 'repaired',
          updatedAt: '2026-06-10',
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          vehicleLedgerProvider.overrideWith((ref, id) async => ledger),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const BodyStatusScreen(vehicleId: 'v1', title: '1234 ABC'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Daños abiertos'), findsOneWidget);
    expect(find.text('Puerta delantera izquierda'), findsOneWidget);
    expect(find.text('Reparados'), findsOneWidget);
  });
}
