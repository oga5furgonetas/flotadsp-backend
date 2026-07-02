"""Tests de contrato modelo↔frontend, sin dependencias (solo stdlib, análisis AST).

Detectan la clase de bug más traicionera de la app: campos que el frontend envía
o lee pero que un modelo Pydantic o una whitelist del backend descartan EN SILENCIO
(guardas y parece que funciona; al recargar, el dato no está).

Uso: python scripts/check_contracts.py   (sale con código 1 si algún contrato se rompe)
"""
import ast
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "backend" / "server.py"


def class_fields(tree: ast.Module, class_name: str) -> set:
    """Nombres de campo (asignaciones anotadas) de una clase Pydantic."""
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                stmt.target.id
                for stmt in node.body
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)
            }
    raise SystemExit(f"FALLO: no se encontró la clase {class_name} en server.py")


def whitelist_set(tree: ast.Module, var_name: str) -> set:
    """Elementos de un set literal asignado a var_name (p.ej. _VEHICLE_ALLOWED)."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == var_name and isinstance(node.value, ast.Set):
                    return {e.value for e in node.value.elts if isinstance(e, ast.Constant)}
    raise SystemExit(f"FALLO: no se encontró el set {var_name} en server.py")


def main() -> int:
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    failures = []

    def require(subset: set, superset: set, what: str):
        missing = subset - superset
        if missing:
            failures.append(f"{what}: faltan {sorted(missing)}")

    vehicle = class_fields(tree, "Vehicle")
    vehicle_create = class_fields(tree, "VehicleCreate")
    driver = class_fields(tree, "Driver")
    driver_create = class_fields(tree, "DriverCreate")
    veh_allowed = whitelist_set(tree, "_VEHICLE_ALLOWED")
    drv_allowed = whitelist_set(tree, "_DRIVER_ALLOWED")

    # El modal "Añadir vehículo" del panel envía estos campos
    require(
        {"license_plate", "brand", "model", "color", "year", "vin", "center",
         "mileage", "provider", "vehicle_type", "fuel_type", "itv_date", "renting_end_date"},
        vehicle_create, "VehicleCreate (modal añadir vehículo)")

    # create_vehicle hace Vehicle(**VehicleCreate.model_dump()): nada debe perderse ahí
    require(vehicle_create - {"documents"}, vehicle, "Vehicle debe cubrir VehicleCreate")

    # La ficha del vehículo edita estos campos vía PATCH (whitelist)
    require(
        {"status", "mileage", "center", "color", "fuel_type", "vehicle_type",
         "itv_date", "renting_end_date", "provider"},
        veh_allowed, "_VEHICLE_ALLOWED (ficha vehículo)")

    # El formulario de conductor envía estos campos (alta y edición)
    driver_form = {"name", "dni", "phone", "email", "license_number", "center",
                   "driver_id", "contrato", "nivel", "alojamiento", "notas"}
    require(driver_form, driver_create | {"password"}, "DriverCreate (alta conductor)")
    require(driver_form, drv_allowed, "_DRIVER_ALLOWED (edición conductor)")

    # GET /drivers usa response_model=Driver: lo que no esté aquí no llega al panel
    require({"contrato", "nivel", "zona", "alojamiento", "notas", "photo_url"},
            driver, "Driver (respuesta GET /drivers)")

    if failures:
        print("CONTRATOS ROTOS (campos que se descartarían en silencio):")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("contratos OK: modelos y whitelists cubren todos los campos del frontend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
