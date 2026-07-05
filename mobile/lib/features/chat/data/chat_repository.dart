import '../../../core/network/api_client.dart';
import '../domain/chat_message.dart';

/// Acceso al chat de centro desde el backend real.
class ChatRepository {
  const ChatRepository(this._client);
  final ApiClient _client;

  /// Mensajes del centro, ordenados del más antiguo al más reciente
  /// (el backend los devuelve al revés).
  Future<List<ChatMessage>> messages(String center) async {
    final res = await _client.get<Map<String, dynamic>>('/chat/$center');
    final list = (res.data?['messages'] as List?) ?? const [];
    final msgs = list
        .whereType<Map>()
        .map((e) => ChatMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return msgs.reversed.toList();
  }

  Future<void> send(String center, String text) async {
    await _client.post<dynamic>('/chat/$center', data: {'text': text});
  }
}
