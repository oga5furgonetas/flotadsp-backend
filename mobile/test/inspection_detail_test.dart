import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/inspections/domain/inspection_detail.dart';
import 'package:flotadsp_admin/features/inspections/presentation/inspection_detail_screen.dart';
import 'package:flotadsp_admin/features/inspections/presentation/inspection_providers.dart';

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
            {
              'severity': 'leve',
              'label': 'arañazo',
              'position': 'puerta_conductor',
              'confidence': 0.87,
            },
            {
              'severity': 'moderado',
              'type': 'abolladura',
              'zone': 'parachoques_trasero',
              'notes': 'Zona con óxido',
            },
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

    test('fromJson tolera fotos como objetos y damages a nivel raíz', () {
      final d = InspectionDetail.fromJson({
        'id': 'insp2',
        'photos': [
          {'url': '/u/1.jpg', 'label': 'frontal'},
          {'path': '/u/2.jpg', 'name': 'lateral_izq'},
        ],
        'damages': [
          {'severity': 'grave', 'label': 'rotura', 'is_new': false},
        ],
      });

      expect(d.photos.length, 2);
      expect(d.photos.first.label, 'frontal');
      expect(d.photos.last.url, '/u/2.jpg');
      expect(d.damages.single.severity, 'grave');
      expect(d.damages.single.isNew, isFalse);
      expect(d.severity, 'sin_analisis'); // sin analysis → default
    });

    test('fromJson con respuesta vacía no rompe', () {
      final d = InspectionDetail.fromJson(const {});
      expect(d.id, '');
      expect(d.photos, isEmpty);
      expect(d.damages, isEmpty);
      expect(d.newDamagesCount, 0);
      expect(d.severity, 'sin_analisis');
    });

    test('fromJson parsea notas administrativas y metadatos de revisión', () {
      final d = InspectionDetail.fromJson({
        'id': 'insp3',
        'reviewed': true,
        'admin_notes': 'Enviado a taller el 06/07',
        'reviewed_at': '2026-07-06T09:15:00Z',
        'reviewed_by': 'Admin Central',
      });
      expect(d.reviewed, isTrue);
      expect(d.adminNotes, 'Enviado a taller el 06/07');
      expect(d.reviewedAt, '2026-07-06T09:15:00Z');
      expect(d.reviewedBy, 'Admin Central');
    });

    test('fromJson acepta alias review_notes / reviewer_notes', () {
      final d1 = InspectionDetail.fromJson({'review_notes': 'x'});
      final d2 = InspectionDetail.fromJson({'reviewer_notes': 'y'});
      expect(d1.adminNotes, 'x');
      expect(d2.adminNotes, 'y');
    });
  });

  group('InspectionDetailScreen', () {
    testWidgets('muestra cabecera, contadores y tarjetas de daños',
        (tester) async {
      // Viewport alto para que el ListView materialice también los daños
      // (por defecto flutter_test usa 800x600 y quedan bajo la línea de flotación).
      await tester.binding.setSurfaceSize(const Size(1000, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      const detail = InspectionDetail(
        id: 'insp1',
        date: '2026-07-05T10:30:00Z',
        driver: 'Dani',
        severity: 'moderado',
        reviewed: true,
        photos: [InspectionPhoto(url: '/uploads/a.jpg', label: 'frontal')],
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
          overrides: [
            inspectionDetailProvider('insp1').overrideWith((ref) async => detail),
            inspectionAnnotatedProvider('insp1').overrideWith((ref) async => const <String>[]),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const InspectionDetailScreen(inspectionId: 'insp1'),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Inspección'), findsOneWidget);
      expect(find.text('Dani'), findsOneWidget);
      expect(find.text('1234ABC'), findsOneWidget);
      expect(find.text('OGA5'), findsOneWidget);
      expect(find.text('Arañazo'), findsOneWidget);
      expect(find.text('Rotura'), findsOneWidget);
      expect(find.text('Moderado'), findsWidgets);
    });

    testWidgets('sin daños muestra un banner de "Sin daños registrados"',
        (tester) async {
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
          overrides: [
            inspectionDetailProvider('insp2').overrideWith((ref) async => detail),
            inspectionAnnotatedProvider('insp2').overrideWith((ref) async => const <String>[]),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const InspectionDetailScreen(inspectionId: 'insp2'),
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('Sin daños'), findsWidgets);
    });
  });
}
