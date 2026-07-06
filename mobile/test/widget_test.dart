import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flotadsp_admin/core/theme/app_theme.dart';
import 'package:flotadsp_admin/features/auth/presentation/login_screen.dart';

Widget _wrap() => ProviderScope(
      child: MaterialApp(theme: AppTheme.light, home: const LoginScreen()),
    );

void main() {
  testWidgets('El login muestra los campos y el botón Entrar', (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pumpAndSettle();

    expect(find.text('Usuario'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Entrar'), findsOneWidget);
  });

  testWidgets('Enviar el login vacío muestra validación y no navega', (tester) async {
    await tester.pumpWidget(_wrap());
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    expect(find.text('Introduce tu usuario'), findsOneWidget);
    expect(find.text('Introduce tu contraseña'), findsOneWidget);
  });
}
