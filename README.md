# SGVA Empresas - Evaluador de Empresas ADS

## 1. Visión General
SGVA Empresas es una plataforma diseñada para evaluar y enriquecer ofertas de aprendizaje (ADS) provenientes del sistema del SENA. El sistema analiza la viabilidad, el perfil técnico y la reputación de las empresas oferentes para asegurar la calidad de las prácticas de aprendizaje mediante un motor de scoring basado en datos enriquecidos.

## 2. Stack Tecnológico
- **Framework**: [Astro](https://astro.build/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Base de Datos**: PostgreSQL
- **Autenticación**: OAuth (Implementación personalizada)
- **API Integrations**: GitHub, RUES, SGVA

## 3. Configuración y Desarrollo

### Requisitos previos
- Node.js (v20+)
- PostgreSQL (Base de datos compatible)

### Pasos de instalación
1. **Instalar dependencias**:
   ```bash
   npm install
   ```
2. **Configurar variables de entorno**:
   Copie el archivo `.env.example` a `.env` y configure las credenciales necesarias (Base de datos, tokens de APIs, etc.).
   ```bash
   cp .env.example .env
   ```
3. **Generar cliente Prisma**:
   ```bash
   npx prisma generate
   ```
4. **Iniciar servidor de desarrollo**:
   ```bash
   npm run dev
   ```

## 4. Estructura del Proyecto
- `/prisma`: Definición del esquema de base de datos y migraciones.
- `/src/pages`: Definición de rutas (páginas) y endpoints API del backend (Astro).
- `/src/lib`: Lógica de negocio central (servicios de scoring, integraciones con APIs externas, cliente Prisma, utilidades).
- `/src/components`: Componentes de interfaz de usuario.

## 5. Mantenimiento y Calidad
Este proyecto sigue estándares de calidad rigurosos. Consulte el documento `docs/contexto_agente/PLAN_ACCION_CRITICO.md` para conocer el estado actual de la deuda técnica, las correcciones planeadas y la hoja de ruta para el despliegue en producción.
