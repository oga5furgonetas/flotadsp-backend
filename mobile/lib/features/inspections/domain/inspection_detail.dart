/// Detalle completo de una inspección (respuesta de `GET /inspections/{id}`).
/// Se parsea de forma defensiva porque el backend puede devolver las fotos
/// como lista de strings (URLs) o como objetos, y los daños dentro de
/// `analysis.new_damages`, `analysis.damages` o `damages` a nivel raíz.
class InspectionDetail {
  const InspectionDetail({
    required this.id,
    required this.date,
    required this.driver,
    required this.severity,
    required this.reviewed,
    required this.photos,
    required this.damages,
    required this.newDamagesCount,
    this.vehicleId,
    this.vehiclePlate,
    this.center,
    this.notes,
    this.adminNotes,
    this.reviewedAt,
    this.reviewedBy,
  });

  final String id;
  final String? date; // ISO
  final String driver;
  final String severity;
  final bool reviewed;
  final List<InspectionPhoto> photos;
  final List<DamageItem> damages;
  final int newDamagesCount;
  final String? vehicleId;
  final String? vehiclePlate;
  final String? center;
  final String? notes;
  final String? adminNotes; // notas del administrador tras la revisión
  final String? reviewedAt; // ISO — cuándo se marcó como revisada
  final String? reviewedBy; // nombre del admin que revisó

  factory InspectionDetail.fromJson(Map<String, dynamic> j) {
    final analysis = (j['analysis'] as Map?)?.cast<String, dynamic>() ?? const {};

    // Fotos: acepta lista de strings o de objetos {url,label,...}.
    final rawPhotos = j['photos'] ?? j['images'];
    final photos = <InspectionPhoto>[];
    if (rawPhotos is List) {
      for (final p in rawPhotos) {
        if (p is String && p.isNotEmpty) {
          photos.add(InspectionPhoto(url: p));
        } else if (p is Map) {
          final ph = InspectionPhoto.fromJson(Map<String, dynamic>.from(p));
          if (ph.url.isNotEmpty) photos.add(ph);
        }
      }
    }

    // Daños: prioriza new_damages dentro de analysis; si no, damages a raíz.
    final rawDamages = analysis['new_damages'] ?? analysis['damages'] ?? j['damages'];
    final damages = <DamageItem>[];
    if (rawDamages is List) {
      for (final d in rawDamages) {
        if (d is Map) {
          damages.add(DamageItem.fromJson(Map<String, dynamic>.from(d)));
        }
      }
    }

    return InspectionDetail(
      id: (j['id'] ?? '').toString(),
      date: j['created_at'] as String?,
      driver: (j['driver_name'] ?? '') as String,
      severity: (analysis['severity'] ?? j['severity'] ?? 'sin_analisis') as String,
      reviewed: (j['reviewed'] ?? false) == true,
      photos: photos,
      damages: damages,
      newDamagesCount: _int(analysis['new_damages_count']) ?? damages.length,
      vehicleId: j['vehicle_id']?.toString(),
      vehiclePlate: (j['license_plate'] ?? j['vehicle_plate']) as String?,
      center: j['center'] as String?,
      notes: (j['notes'] ?? j['observations']) as String?,
      adminNotes: (j['admin_notes'] ?? j['review_notes'] ?? j['reviewer_notes']) as String?,
      reviewedAt: (j['reviewed_at'] ?? j['review_date']) as String?,
      reviewedBy: (j['reviewed_by'] ?? j['reviewer_name']) as String?,
    );
  }
}

/// Foto de una inspección. `label` describe la posición ("frontal", "lateral
/// izquierdo", …). `annotatedUrl` se rellena si el objeto ya viene con la
/// versión anotada; si no, se obtendrá aparte vía el endpoint /annotated.
class InspectionPhoto {
  const InspectionPhoto({required this.url, this.label, this.annotatedUrl});

  final String url;
  final String? label;
  final String? annotatedUrl;

  factory InspectionPhoto.fromJson(Map<String, dynamic> j) => InspectionPhoto(
        url: (j['url'] ?? j['path'] ?? j['image'] ?? '').toString(),
        label: (j['label'] ?? j['name'] ?? j['position']) as String?,
        annotatedUrl: (j['annotated_url'] ?? j['annotated']) as String?,
      );
}

/// Un daño detectado (o registrado) en una inspección.
class DamageItem {
  const DamageItem({
    required this.severity,
    this.id,
    this.label,
    this.position,
    this.notes,
    this.confidence,
    this.isNew = true,
  });

  final String severity; // sin_danos | leve | moderado | grave | critico
  final String? id;
  final String? label; // p. ej. "arañazo", "abolladura"
  final String? position; // p. ej. "puerta_conductor"
  final String? notes;
  final double? confidence; // 0..1
  final bool isNew;

  factory DamageItem.fromJson(Map<String, dynamic> j) {
    final rawConf = j['confidence'] ?? j['score'] ?? j['probability'];
    return DamageItem(
      severity: (j['severity'] ?? 'sin_analisis') as String,
      id: j['id']?.toString(),
      label: (j['label'] ?? j['type'] ?? j['name'] ?? j['damage_type']) as String?,
      position: (j['position'] ?? j['location'] ?? j['zone'] ?? j['part']) as String?,
      notes: (j['notes'] ?? j['description']) as String?,
      confidence: rawConf is num ? rawConf.toDouble() : null,
      isNew: j['is_new'] == null ? true : j['is_new'] == true,
    );
  }
}

int? _int(Object? v) {
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}
