import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

/// Shell tras el login. En la Fase B se sustituye por el dashboard con datos
/// reales; aquí ya se ve la sesión real (nombre, rol, centros) y el toggle de
/// tema claro/oscuro funcionando.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
    final mode = ref.watch(themeModeProvider);
    final colors = Theme.of(context).extension<AppColors>()!;

    return Scaffold(
      appBar: AppBar(
        title: const Text('FlotaDSP'),
        actions: [
          IconButton(
            tooltip: 'Tema',
            icon: Icon(mode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            onPressed: () {
              final next = mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
              ref.read(themeModeProvider.notifier).state = next;
            },
          ),
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Hola, ${session?.name ?? ''} 👋',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            session?.superAdmin == true ? 'Super-admin' : 'Administración',
            style: TextStyle(color: colors.muted),
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.check_circle_rounded, color: AppTheme.success, size: 18),
                      SizedBox(width: 8),
                      Text('Sesión conectada al backend real', style: TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _Row(label: 'Usuario', value: session?.name ?? '—'),
                  _Row(label: 'Rol', value: session?.role ?? '—'),
                  _Row(
                    label: 'Centros',
                    value: (session?.centers.isNotEmpty ?? false)
                        ? session!.centers.join(', ')
                        : '—',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Próximo (Fase B): dashboard con estadísticas reales, flota, '
            'inspecciones y revisión rápida.',
            style: TextStyle(color: colors.muted, fontSize: 13, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColors>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 90, child: Text(label, style: TextStyle(color: colors.muted, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
