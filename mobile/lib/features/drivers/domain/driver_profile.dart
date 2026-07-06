/// Ficha completa de un conductor (`GET /drivers`, modelo Driver del backend).
class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.name,
    this.dni,
    this.phone,
    this.email,
    this.licenseNumber,
    this.center,
    this.active = true,
    this.contrato,
    this.nivel,
    this.zona,
    this.alojamiento,
    this.notas,
    this.amazonId,
    this.photoUrl,
  });

  final String id;
  final String name;
  final String? dni;
  final String? phone;
  final String? email;
  final String? licenseNumber;
  final String? center;
  final bool active;
  final String? contrato; // empresa | ett
  final String? nivel; // pleno | L1 | L2 | L3
  final String? zona;
  final String? alojamiento;
  final String? notas;
  final String? amazonId; // driver_id (ID de Amazon)
  final String? photoUrl;

  DriverProfile copyWith({
    String? name,
    String? dni,
    String? phone,
    String? email,
    String? center,
    bool? active,
    String? contrato,
    String? nivel,
    String? zona,
    String? notas,
  }) =>
      DriverProfile(
        id: id,
        name: name ?? this.name,
        dni: dni ?? this.dni,
        phone: phone ?? this.phone,
        email: email ?? this.email,
        licenseNumber: licenseNumber,
        center: center ?? this.center,
        active: active ?? this.active,
        contrato: contrato ?? this.contrato,
        nivel: nivel ?? this.nivel,
        zona: zona ?? this.zona,
        alojamiento: alojamiento,
        notas: notas ?? this.notas,
        amazonId: amazonId,
        photoUrl: photoUrl,
      );

  factory DriverProfile.fromJson(Map<String, dynamic> j) => DriverProfile(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? '') as String,
        dni: j['dni'] as String?,
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        licenseNumber: j['license_number'] as String?,
        center: j['center'] as String?,
        active: (j['active'] ?? true) == true,
        contrato: j['contrato'] as String?,
        nivel: j['nivel'] as String?,
        zona: j['zona'] as String?,
        alojamiento: j['alojamiento'] as String?,
        notas: (j['notas'] ?? j['notes']) as String?,
        amazonId: j['driver_id'] as String?,
        photoUrl: j['photo_url'] as String?,
      );
}
