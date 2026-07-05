/// Resumen de una inspección (de `GET /inspections/vehicle/{id}`).
class InspectionSummary {
  const InspectionSummary({
    required this.id,
    required this.date,
    required this.driver,
    required this.severity,
    required this.damageCount,
    required this.photoCount,
    required this.reviewed,
  });

  final String id;
  final String? date; // ISO
  final String driver;
  final String severity;
  final int damageCount;
  final int photoCount;
  final bool reviewed;

  factory InspectionSummary.fromJson(Map<String, dynamic> j) {
    final analysis = (j['analysis'] as Map?)?.cast<String, dynamic>() ?? const {};
    final photos = j['photos'];
    return InspectionSummary(
      id: (j['id'] ?? '').toString(),
      date: j['created_at'] as String?,
      driver: (j['driver_name'] ?? '') as String,
      severity: (analysis['severity'] ?? 'sin_analisis') as String,
      damageCount: _damages(analysis),
      photoCount: photos is List ? photos.length : 0,
      reviewed: (j['reviewed'] ?? false) == true,
    );
  }

  static int _damages(Map<String, dynamic> analysis) {
    final n = analysis['new_damages_count'];
    if (n is num) return n.toInt();
    final list = analysis['new_damages'] ?? analysis['damages'];
    if (list is List) return list.length;
    return 0;
  }
}
