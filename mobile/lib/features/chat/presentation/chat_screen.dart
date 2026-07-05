import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/error_view.dart';
import '../data/chat_repository.dart';
import '../domain/chat_message.dart';

final _chatRepoProvider = Provider<ChatRepository>((ref) => ChatRepository(ref.watch(apiClientProvider)));
final chatMessagesProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>(
  (ref, center) => ref.watch(_chatRepoProvider).messages(center),
);

/// Chat de centro (página completa): burbujas, envío y selector de centro.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _ctrl = TextEditingController();
  String? _center;
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    final center = _center;
    if (text.isEmpty || center == null || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(_chatRepoProvider).send(center, text);
      _ctrl.clear();
      ref.invalidate(chatMessagesProvider(center));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo enviar: $e')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authControllerProvider).session;
    final centers = session?.centers ?? const [];
    _center ??= centers.isNotEmpty ? centers.first : null;
    final myId = session?.id ?? '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chat'),
        actions: [
          if (centers.length > 1)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: DropdownButton<String>(
                value: _center,
                underline: const SizedBox.shrink(),
                onChanged: (c) => setState(() => _center = c),
                items: [for (final c in centers) DropdownMenuItem(value: c, child: Text(c))],
              ),
            ),
        ],
      ),
      body: _center == null
          ? Center(child: Text('No tienes ningún centro asignado',
              style: TextStyle(color: Theme.of(context).extension<AppColors>()!.muted)))
          : Column(
              children: [
                Expanded(child: _messages(_center!, myId)),
                _inputBar(),
              ],
            ),
    );
  }

  Widget _messages(String center, String myId) {
    final async = ref.watch(chatMessagesProvider(center));
    return async.when(
      data: (list) {
        if (list.isEmpty) {
          return Center(child: Text('Sé el primero en escribir',
              style: TextStyle(color: Theme.of(context).extension<AppColors>()!.muted)));
        }
        return RefreshIndicator(
          color: AppTheme.brand,
          onRefresh: () => ref.refresh(chatMessagesProvider(center).future),
          child: ListView.builder(
            reverse: true,
            padding: const EdgeInsets.all(14),
            itemCount: list.length,
            itemBuilder: (context, i) {
              final m = list[list.length - 1 - i]; // reverse view: más reciente abajo
              return _Bubble(message: m, mine: m.authorId == myId);
            },
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brand)),
      error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(chatMessagesProvider(center))),
    );
  }

  Widget _inputBar() {
    final border = Theme.of(context).extension<AppColors>()!.border;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(border: Border(top: BorderSide(color: border))),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(hintText: 'Escribe un mensaje…', isDense: true),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _sending ? null : _send,
              style: IconButton.styleFrom(backgroundColor: AppTheme.brand, foregroundColor: Colors.white),
              icon: _sending
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.send_rounded, size: 20),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine});
  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final surface = Theme.of(context).extension<AppColors>()!.surface;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.76),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: mine ? AppTheme.brand.withValues(alpha: 0.16) : surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(mine ? 14 : 4),
            bottomRight: Radius.circular(mine ? 4 : 14),
          ),
          border: Border.all(color: mine ? AppTheme.brand.withValues(alpha: 0.3) : muted.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine)
              Text(message.authorName, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.brand)),
            Text(message.text, style: const TextStyle(fontSize: 14, height: 1.35)),
            const SizedBox(height: 2),
            Text(_fmtTime(message.createdAt), style: TextStyle(fontSize: 10, color: muted)),
          ],
        ),
      ),
    );
  }
}

String _fmtTime(String? iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.hour)}:${two(d.minute)}';
}
