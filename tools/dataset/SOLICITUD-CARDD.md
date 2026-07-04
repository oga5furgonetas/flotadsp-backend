# Solicitud de licencia CarDD — pasos exactos

La licencia (docs/CarDD_license.pdf del zip que bajaste) dice textualmente que
**cualquier uso comercial debe ser autorizado primero por el PIC Lab**. FlotaDSP
es un sistema comercial → hay que pedir esa autorización explícitamente.
Usar el enlace de Drive sin ella violaría los términos.

## Qué hacer (10 minutos)

1. Abre `CarDD-USTC.github.io-main/docs/CarDD_license.pdf`
2. Rellena: Affiliation (tu empresa), Name, Email, Signature (firma)
3. Envíalo a **wangxk0624@mail.ustc.edu.cn** con este texto:

---

**Subject:** CarDD dataset license request — commercial use authorization

Dear Dr. Wang,

I am the founder of FlotaDSP (flotadsp.com), a fleet-management platform for
Amazon Delivery Service Partners in Spain. We use computer vision to document
van damage from driver photos.

I have read and signed the attached CarDD license form. In addition to research
use, I would like to explicitly request **authorization for commercial use**:
we would use CarDD solely as complementary training data (combined with our own
labeled fleet images) to improve a damage-detection model served inside our
product. We will not redistribute the dataset or any of its images, and we will
cite your IEEE T-ITS paper in any derived publication or documentation.

If commercial use requires a separate agreement or fee, please let me know the
conditions.

Thank you for making this valuable dataset available.

Best regards,
[Tu nombre]
Founder, FlotaDSP — [tu email]

---

4. Cuando respondan con el enlace y el OK comercial POR ESCRITO, guarda ese
   email. Entonces: descargar, y correr
   `python tools/dataset/convert_coco_damage.py --coco <annotations> --images <imgs> --out data/cardd --source cardd`
   y el merge. Sin el OK escrito, CarDD no entra en el entrenamiento.

## Plan B si no contestan o piden fee alto

Datasets "car damage" de Roboflow Universe con licencia CC BY 4.0 (uso comercial
permitido citando la fuente). Mismo convertidor, cero fricción legal.
