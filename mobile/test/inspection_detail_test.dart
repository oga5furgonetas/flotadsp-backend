import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/inspections/domain/inspection_detail.dart';
import 'package:flotadsp_admin/features/inspections/presentation/inspection_detail_screen.dart';

void main() {
  group('InspectionDetail', () {
    test('fromJson parsea fotos como strings y daños dentro de analysis', () {
      final d = InspectionDetail.fromJson({
        'id': 'insp1',
        'created_at': '2026-07-05T10:30:00Z',
        'driver_name': 'Dani',
        'reviewed': true,
        'license_plate': '1234ABC',
        'center': 'OGA5',
        'photos': ['/uploads/a.jpg', '/uploads/b.jpg'],
        'analysis': {
          'severity': 'moderado',
          'new_damages_count': 2,
          'new_damages': [
            {'severity': 'leve', 'label': 'arañazo', 'position': 'puerta_conductor', 'confidence': 0.87},
            {'severity': 'moderado', 'type': 'abolladura', 'zone': 'parachoques_trasero', 'notes': 'Zona con óxido'},
          ],
        },
      });

      expect(d.id, 'insp1');
      expect(d.driver, 'Dani');
      expect(d.severity, 'moderado');
      expect(d.reviewed, isTrue);
      expect(d.vehiclePlate, '1234ABC');
      expect(d.center, 'OGA5');
      expect(d.photos.length, 2);
      expect(d.photos.first.url, '/uploads/a.jpg');
      expect(d.damages.length, 2);
      expect(d.damages.first.label, 'arañazo');
      expect(d.damages.first.confidence, closeTo(0.87, 0.001));
      expect(d.damages.last.label, 'abolladura');
      expect(d.damages.last.position, 'parachoques_trasero');
      expect(d.newDamagesCount, 2);
    });

    test('empareja annotated_photos con photos por índice', () {
      final d = InspectionDetail.fromJson({
        'id': 'x',
        'photos': ['/a.jpg', '/b.jpg'],
        'annotated_photos': ['/a_ann.jpg', null],
      });
      expect(d.photos[0].annotatedUrl, '/a_ann.jpg');
      expect(d.photos[1].annotatedUrl, isNull);
    });

    test('lee daños de new_damages a nivel raíz (formato cola de revisión)', () {
      final d = InspectionDetail.fromJson({
        'id': 'q1',
        'severity': 'grave',
        'plate_mismatch': true,
        'image_quality_warnings': ['Foto borrosa'],
        'new_damages': [
          {'part': 'puerta', 'severity': 'grave', 'description': 'Abolladura'},
        ],
      });
      expect(d.severity, 'grave');
      expect(d.plateMismatch, isTrue);
      expect(d.qualityWarnings, ['Foto borrosa']);
      expect(d.damages.single.position, 'puerta');
      expect(d.damages.single.notes, 'Abolladura');
    });

    test('fromJson con respuesta vacía no rompe', () {
      final d = InspectionDetail.fromJson(const {});
      expect(d.id, '');
      expect(d.photos, isEmpty);
      expect(d.damages, isEmpty);
      expect(d.severity, 'sin_analisis');
    });
  });

  group('InspectionDetailScreen', () {
    testWidgets('muestra matrícula, conductor y daños', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1000, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      const detail = InspectionDetail(
        id: 'insp1',
        date: '2026-07-05T10:30:00Z',
        driver: 'Dani',
        severity: 'moderado',
        reviewed: true,
        photos: [],
        damages: [
          DamageItem(severity: 'leve', label: 'arañazo', position: 'puerta_conductor'),
          DamageItem(severity: 'grave', label: 'rotura'),
        ],
        newDamagesCount: 2,
        vehiclePlate: '1234ABC',
        center: 'OGA5',
      );

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.light,
            home: const InspectionDetailScreen(inspectionId: 'insp1', initial: detail),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('1234ABC'), findsOneWidget); // AppBar
      expect(find.textContaining('Dani'), findsWidgets);
      expect(find.text('arañazo'), findsOneWidget);
      expect(find.text('rotura'), findsOneWidget);
    });

    testWidgets('sin daños muestra "Sin daños detectados"', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1000, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      const detail = InspectionDetail(
        id: 'insp2',
        date: '2026-07-05T10:30:00Z',
        driver: '',
        severity: 'sin_danos',
        reviewed: false,
        photos: [],
        damages: [],
        newDamagesCount: 0,
      );

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.light,
            home: const InspectionDetailScreen(inspectionId: 'insp2', initial: detail),
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('Sin daños'), findsWidgets);
    });
  });
}
