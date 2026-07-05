/// Conductor en el ranking (`GET /drivers/ranking`).
class DriverRank {
  const DriverRank({
    required this.driverId,
    required this.name,
    required this.score,
    this.center,
    this.inspections,
  });

  final String driverId;
  final String name;
  final int score; // 0..100
  final String? center;
  final int? inspections;

  factory DriverRank.fromJson(Map<String, dynamic> j) => DriverRank(
        driverId: (j['driver_id'] ?? j['id'] ?? '').toString(),
        name: (j['name'] ?? '') as String,
        score: _int(j['score']) ?? _int(j['points']) ?? 0,
        center: j['center'] as String?,
        inspections: _int(j['inspections'] ?? j['total_inspections'] ?? j['total']),
      );

  static int? _int(Object? v) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }
}
