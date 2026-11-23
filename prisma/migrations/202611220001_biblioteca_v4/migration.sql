-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('student', 'librarian', 'admin');

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('pending', 'ready', 'collected', 'expired', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "estado_ejemplar" AS ENUM ('available', 'reserved', 'loaned');

-- CreateEnum
CREATE TYPE "condicion_ejemplar" AS ENUM ('excelente', 'regular', 'mantenimiento', 'baja');

-- CreateEnum
CREATE TYPE "estado_sancion" AS ENUM ('pending', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "tipo_incidencia" AS ENUM ('mora', 'dano', 'perdida', 'otro');

-- CreateEnum
CREATE TYPE "estado_incidencia" AS ENUM ('abierta', 'resuelta');

-- CreateEnum
CREATE TYPE "tipo_notificacion" AS ENUM ('reserva', 'incidencia', 'sancion');

-- CreateEnum
CREATE TYPE "estado_notificacion" AS ENUM ('pendiente', 'enviada', 'leida');

-- CreateEnum
CREATE TYPE "metodo_retiro" AS ENUM ('desk', 'locker');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" BIGSERIAL NOT NULL,
    "codigo_usuario" VARCHAR(40) NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL DEFAULT '',
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL DEFAULT '',
    "rol" "rol_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "ultimo_acceso" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "facultad" TEXT NOT NULL DEFAULT '',
    "carrera" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" BIGSERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "libros" (
    "id" BIGSERIAL NOT NULL,
    "categoria_id" BIGINT NOT NULL,
    "isbn" VARCHAR(20) NOT NULL,
    "titulo" VARCHAR(255) NOT NULL,
    "autor" VARCHAR(255) NOT NULL,
    "editorial" VARCHAR(150),
    "anio_publicacion" SMALLINT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "portada_path" VARCHAR(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formato" TEXT NOT NULL,
    "paginas" INTEGER NOT NULL,
    "facultades" TEXT[],
    "demanda" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" JSONB NOT NULL,

    CONSTRAINT "libros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejemplares" (
    "id" BIGSERIAL NOT NULL,
    "libro_id" BIGINT NOT NULL,
    "codigo_inventario" VARCHAR(30) NOT NULL,
    "ubicacion" VARCHAR(100) NOT NULL DEFAULT '',
    "estado" "estado_ejemplar" NOT NULL DEFAULT 'available',
    "condicion" "condicion_ejemplar" NOT NULL DEFAULT 'excelente',

    CONSTRAINT "ejemplares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" BIGSERIAL NOT NULL,
    "codigo_reserva" UUID NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "bibliotecario_id" BIGINT,
    "estado" "estado_reserva" NOT NULL DEFAULT 'pending',
    "fecha_reserva" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_expiracion" TIMESTAMPTZ NOT NULL,
    "fecha_retiro" TIMESTAMPTZ,
    "retiro_programado" TIMESTAMPTZ NOT NULL,
    "nonce" TEXT NOT NULL,
    "consumido_en" TIMESTAMPTZ,
    "metodo_retiro" "metodo_retiro" NOT NULL,
    "casillero" TEXT,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_detalle" (
    "id" BIGSERIAL NOT NULL,
    "reserva_id" BIGINT NOT NULL,
    "posicion" SMALLINT NOT NULL,
    "libro_id" BIGINT NOT NULL,
    "ejemplar_id" BIGINT,
    "estado" "estado_reserva" NOT NULL DEFAULT 'pending',
    "fecha_limite_devol" TIMESTAMPTZ,
    "fecha_devolucion" TIMESTAMPTZ,
    "renovaciones" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reserva_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidencias" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "reserva_detalle_id" BIGINT NOT NULL,
    "registrado_por" BIGINT NOT NULL,
    "tipo" "tipo_incidencia" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "estado_incidencia" NOT NULL DEFAULT 'abierta',
    "evidencias" TEXT[],
    "fecha_incidencia" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanciones" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "incidencia_id" BIGINT NOT NULL,
    "registrado_por" BIGINT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "dias" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_sancion" NOT NULL DEFAULT 'pending',
    "fecha_inicio" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMPTZ,
    "fecha_resolucion" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "reserva_id" BIGINT,
    "reserva_detalle_id" BIGINT,
    "sancion_id" BIGINT,
    "tipo" "tipo_notificacion" NOT NULL,
    "asunto" VARCHAR(150) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "estado" "estado_notificacion" NOT NULL DEFAULT 'pendiente',
    "fecha_programada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_envio" TIMESTAMPTZ,
    "intentos" SMALLINT NOT NULL DEFAULT 0,
    "error_detalle" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "usuario_id" BIGINT,
    "accion" VARCHAR(30) NOT NULL,
    "entidad" VARCHAR(50) NOT NULL,
    "entidad_id" BIGINT,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "ip_origen" INET,
    "actor_rol" TEXT NOT NULL,
    "actor_nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_codes" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_usuario_key" ON "usuarios"("codigo_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "libros_isbn_key" ON "libros"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "ejemplares_codigo_inventario_key" ON "ejemplares"("codigo_inventario");

-- CreateIndex
CREATE INDEX "ejemplares_libro_id_estado_idx" ON "ejemplares"("libro_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ejemplares_id_libro_id_key" ON "ejemplares"("id", "libro_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_codigo_reserva_key" ON "reservas"("codigo_reserva");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_nonce_key" ON "reservas"("nonce");

-- CreateIndex
CREATE INDEX "reservas_estado_fecha_expiracion_idx" ON "reservas"("estado", "fecha_expiracion");

-- CreateIndex
CREATE INDEX "reserva_detalle_ejemplar_id_estado_idx" ON "reserva_detalle"("ejemplar_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_detalle_reserva_id_posicion_key" ON "reserva_detalle"("reserva_id", "posicion");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_detalle_reserva_id_libro_id_key" ON "reserva_detalle"("reserva_id", "libro_id");

-- CreateIndex
CREATE UNIQUE INDEX "auditoria_seq_key" ON "auditoria"("seq");

-- CreateIndex
CREATE INDEX "email_codes_email_purpose_idx" ON "email_codes"("email", "purpose");

-- AddForeignKey
ALTER TABLE "libros" ADD CONSTRAINT "libros_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejemplares" ADD CONSTRAINT "ejemplares_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "libros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_bibliotecario_id_fkey" FOREIGN KEY ("bibliotecario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_detalle" ADD CONSTRAINT "reserva_detalle_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_detalle" ADD CONSTRAINT "reserva_detalle_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "libros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_detalle" ADD CONSTRAINT "reserva_detalle_ejemplar_id_libro_id_fkey" FOREIGN KEY ("ejemplar_id", "libro_id") REFERENCES "ejemplares"("id", "libro_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_reserva_detalle_id_fkey" FOREIGN KEY ("reserva_detalle_id") REFERENCES "reserva_detalle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_incidencia_id_fkey" FOREIGN KEY ("incidencia_id") REFERENCES "incidencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanciones" ADD CONSTRAINT "sanciones_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_detalle_id_fkey" FOREIGN KEY ("reserva_detalle_id") REFERENCES "reserva_detalle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_sancion_id_fkey" FOREIGN KEY ("sancion_id") REFERENCES "sanciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reserva_detalle" ADD CONSTRAINT "detalle_posicion" CHECK ("posicion" BETWEEN 1 AND 3);

CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'Auditoria inmutable';
END;
$guard$;

CREATE TRIGGER audit_immutable_trigger BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria
FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();
