/// Mensaje del chat de un centro (`GET /chat/{center}`).
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.text,
    required this.authorId,
    required this.authorName,
    this.createdAt,
  });

  final String id;
  final String text;
  final String authorId;
  final String authorName;
  final String? createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: (j['id'] ?? '').toString(),
        text: (j['text'] ?? '') as String,
        authorId: (j['author_id'] ?? '').toString(),
        authorName: (j['author_name'] ?? '—') as String,
        createdAt: j['created_at'] as String?,
      );
}
