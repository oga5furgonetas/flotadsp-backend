/// Registro de daños del vehículo (`GET /vehicles/{id}/damage-ledger`):
/// daños abiertos + historial de reparados. Es la base del "gemelo digital".
class DamageLedger {
  const DamageLedger({required this.open, required this.repaired});

  final List<DamageEntry> open;
  final List<DamageEntry> repaired;

  bool get isEmpty => open.isEmpty && repaired.isEmpty;

  factory DamageLedger.fromJson(Map<String, dynamic> j) => DamageLedger(
        open: _list(j['open']),
        repaired: _list(j['repaired']),
      );

  static List<DamageEntry> _list(Object? v) => v is List
      ? v.whereType<Map>().map((e) => DamageEntry.fromJson(Map<String, dynamic>.from(e))).toList()
      : const [];
}

/// Una entrada del ledger: un panel dañado (o reparado).
class DamageEntry {
  const DamageEntry({
    required this.panel,
    required this.part,
    required this.severity,
    required this.status,
    this.firstSeen,
    this.updatedAt,
  });

  final String panel; // clave canónica del panel
  final String part; // nombre legible de la pieza
  final String severity; // leve | moderado | grave | critico | sin_analisis
  final String status; // open | repaired
  final String? firstSeen; // fecha "YYYY-MM-DD"
  final String? updatedAt;

  String get label => part.isNotEmpty ? part : panel.replaceAll('_', ' ');

  /// Zona de la carrocería a la que pertenece (heurística sobre panel/part).
  BodyZone get zone {
    final s = '$panel $part'.toLowerCase();
    bool has(List<String> keys) => keys.any(s.contains);
    if (has(['techo', 'roof', 'baca'])) return BodyZone.roof;
    if (has(['frontal', 'delant', 'morro', 'capo', 'capó', 'parabrisas', 'parrilla', 'faro'])) {
      if (has(['izq'])) return BodyZone.frontLeft;
      if (has(['der'])) return BodyZone.frontRight;
      return BodyZone.front;
    }
    if (has(['tras', 'porton', 'portón', 'maletero', 'luna trasera'])) {
      if (has(['izq'])) return BodyZone.rearLeft;
      if (has(['der'])) return BodyZone.rearRight;
      return BodyZone.rear;
    }
    if (has(['izq'])) return BodyZone.left;
    if (has(['der'])) return BodyZone.right;
    return BodyZone.body;
  }

  factory DamageEntry.fromJson(Map<String, dynamic> j) => DamageEntry(
        panel: (j['panel'] ?? '') as String,
        part: (j['part'] ?? '') as String,
        severity: (j['severity'] ?? 'sin_analisis') as String,
        status: (j['status'] ?? 'open') as String,
        firstSeen: j['first_seen'] as String?,
        updatedAt: j['updated_at'] as String?,
      );
}

/// Zonas del esquema de carrocería.
enum BodyZone { front, frontLeft, frontRight, left, right, roof, rear, rearLeft, rearRight, body }
