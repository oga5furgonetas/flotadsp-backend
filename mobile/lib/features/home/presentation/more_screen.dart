import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';

/// Pestaña "Más": accesos a Conductores, Incidencias, Chat y Ajustes.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
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
                  radius: 24,
                  backgroundColor: AppTheme.brand.withValues(alpha: 0.15),
                  child: Text(
                    (session?.name.isNotEmpty ?? false) ? session!.name[0].toUpperCase() : '?',
                    style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(session?.name ?? '—', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
        _MenuTile(icon: Icons.emoji_events_rounded, label: 'Conductores', color: const Color(0xFFA78BFA), onTap: () => context.push('/drivers')),
        _MenuTile(icon: Icons.report_problem_rounded, label: 'Incidencias', color: AppTheme.danger, onTap: () => context.push('/incidents')),
        _MenuTile(icon: Icons.forum_rounded, label: 'Chat de centro', color: AppTheme.info, onTap: () => context.push('/chat')),
        _MenuTile(icon: Icons.settings_rounded, label: 'Ajustes', color: muted, onTap: () => context.push('/settings')),
      ],
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: color, size: 20),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
