import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/features/auth/domain/session.dart';

void main() {
  group('Session', () {
    test('fromLogin parsea la respuesta del backend', () {
      final s = Session.fromLogin({
        'access_token': 'jwt123',
        'id': 'u1',
        'name': 'Dani',
        'role': 'admin',
        'account_type': 'owner',
        'slug': 'oga5',
        'super_admin': true,
        'centers': ['OGA5', 'DGA1'],
      });

      expect(s.token, 'jwt123');
      expect(s.name, 'Dani');
      expect(s.isAdmin, isTrue);
      expect(s.superAdmin, isTrue);
      expect(s.centers, ['OGA5', 'DGA1']);
    });

    test('round-trip por almacenamiento conserva los datos (token aparte)', () {
      final original = Session.fromLogin({
        'access_token': 'viejo',
        'id': 'u2',
        'name': 'Mery',
        'role': 'admin',
        'centers': ['DGA2'],
      });

      final map = jsonDecode(original.toStorageJson()) as Map<String, dynamic>;
      final restored = Session.fromStorage(map, 'nuevo-token');

      expect(restored.token, 'nuevo-token'); // el token viene aparte (cifrado)
      expect(restored.name, 'Mery');
      expect(restored.role, 'admin');
      expect(restored.centers, ['DGA2']);
    });
  });
}
