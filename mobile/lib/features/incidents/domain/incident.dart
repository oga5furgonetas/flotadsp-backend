/// Incidencia de un vehículo (`GET /incidents`).
class Incident {
  const Incident({
    required this.id,
    required this.title,
    required this.description,
    required this.severity,
    required this.status,
    this.createdAt,
    this.createdBy,
    this.vehicleId,
    this.photoCount = 0,
  });

  final String id;
  final String title;
  final String description;
  final String severity; // leve | moderado | grave | critico
  final String status; // open | resolved | closed
  final String? createdAt;
  final String? createdBy;
  final String? vehicleId;
  final int photoCount;

  bool get isOpen => status == 'open';

  factory Incident.fromJson(Map<String, dynamic> j) {
    final photos = j['photos'];
    final title = (j['title'] ?? '') as String;
    final desc = (j['description'] ?? '') as String;
    return Incident(
      id: (j['id'] ?? '').toString(),
      title: title.isNotEmpty ? title : (desc.isNotEmpty ? desc : 'Incidencia'),
      description: desc,
      severity: (j['severity'] ?? 'leve') as String,
      status: (j['status'] ?? 'open') as String,
      createdAt: j['created_at'] as String?,
      createdBy: j['created_by_name'] as String?,
      vehicleId: j['vehicle_id']?.toString(),
      photoCount: photos is List ? photos.length : 0,
    );
  }
}
