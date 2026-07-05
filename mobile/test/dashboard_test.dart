import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/dashboard/domain/dashboard_stats.dart';
import 'package:flotadsp_admin/features/dashboard/presentation/dashboard_providers.dart';
import 'package:flotadsp_admin/features/dashboard/presentation/dashboard_screen.dart';

void main() {
  testWidgets('El dashboard pinta las estadísticas reales', (tester) async {
    const stats = DashboardStats(
      totalVehicles: 42,
      vehiclesInWorkshop: 3,
      totalDrivers: 55,
      totalInspections: 1200,
      unreadAlerts: 4,
      openIncidents: 1,
      severity: {'sin_danos': 10, 'leve': 20, 'moderado': 5, 'grave': 2, 'critico': 1},
      weekly: [DailyActivity(date: '2026-07-01', inspections: 8, damages: 2)],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dashboardStatsProvider.overrideWith((ref) async => stats),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const Scaffold(body: DashboardScreen()),
        ),
      ),
    );
    await tester.pump(); // resuelve el Future del provider

    expect(find.text('42'), findsOneWidget); // furgonetas
    expect(find.text('55'), findsOneWidget); // conductores
    expect(find.text('Furgonetas'), findsOneWidget);
  });
}
