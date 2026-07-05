import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

/// Pestaña "Ajustes": datos de la sesión real, tema y cierre de sesión.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
    final mode = ref.watch(themeModeProvider);
    final muted = Theme.of(context).extension<AppColors>()!.muted;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppTheme.brand.withValues(alpha: 0.15),
                  child: Text(
                    (session?.name.isNotEmpty ?? false) ? session!.name[0].toUpperCase() : '?',
                    style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.w800, fontSize: 20),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(session?.name ?? '—',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(session?.superAdmin == true ? 'Super-admin' : 'Administración',
                          style: TextStyle(color: muted, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('APARIENCIA', style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              _ThemeOption(label: 'Sistema', icon: Icons.brightness_auto_rounded, value: ThemeMode.system, group: mode, ref: ref),
              const Divider(height: 1),
              _ThemeOption(label: 'Claro', icon: Icons.light_mode_rounded, value: ThemeMode.light, group: mode, ref: ref),
              const Divider(height: 1),
              _ThemeOption(label: 'Oscuro', icon: Icons.dark_mode_rounded, value: ThemeMode.dark, group: mode, ref: ref),
            ],
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppTheme.danger,
            minimumSize: const Size.fromHeight(50),
            side: BorderSide(color: AppTheme.danger.withValues(alpha: 0.4)),
          ),
          icon: const Icon(Icons.logout_rounded, size: 18),
          label: const Text('Cerrar sesión'),
        ),
        const SizedBox(height: 16),
        Center(
          child: Text('FlotaDSP · v1.0.0', style: TextStyle(color: muted, fontSize: 12)),
        ),
      ],
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.label,
    required this.icon,
    required this.value,
    required this.group,
    required this.ref,
  });
  final String label;
  final IconData icon;
  final ThemeMode value;
  final ThemeMode group;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final selected = value == group;
    return ListTile(
      leading: Icon(icon, size: 20, color: selected ? AppTheme.brand : null),
      title: Text(label),
      trailing: selected ? const Icon(Icons.check_rounded, color: AppTheme.brand, size: 20) : null,
      onTap: () => ref.read(themeModeProvider.notifier).state = value,
    );
  }
}
