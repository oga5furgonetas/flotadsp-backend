/// Vehículo de la flota (respuesta de `GET /vehicles`).
class Vehicle {
  const Vehicle({
    required this.id,
    required this.licensePlate,
    required this.brand,
    required this.model,
    required this.status,
    this.center,
    this.itvDate,
    this.mileage,
  });

  final String id;
  final String licensePlate;
  final String brand;
  final String model;
  final String status; // active | taller | baja
  final String? center;
  final String? itvDate; // ISO YYYY-MM-DD
  final int? mileage;

  String get title => licensePlate.isNotEmpty ? licensePlate : '$brand $model';
  String get subtitle => [brand, model].where((s) => s.isNotEmpty).join(' ');

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
        id: (j['id'] ?? '').toString(),
        licensePlate: (j['license_plate'] ?? '') as String,
        brand: (j['brand'] ?? '') as String,
        model: (j['model'] ?? '') as String,
        status: (j['status'] ?? 'active') as String,
        center: j['center'] as String?,
        itvDate: j['itv_date'] as String?,
        mileage: j['mileage'] is num ? (j['mileage'] as num).toInt() : null,
      );
}
