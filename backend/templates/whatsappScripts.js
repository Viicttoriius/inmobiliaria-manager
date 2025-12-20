const whatsappScripts = {
    // 1. Mensaje Inicial (Disparador)
    initial_contact: {
        label: "1. Contacto Inicial (Disparador)",
        text: `Hola, le contacto por la propiedad que tiene en venta`
    },

    // 2. Respuesta a "¿Eres inmobiliaria?" (Bloque Alex Aldazabal)
    objection_agency: {
        label: "2. Respuesta a '¿Eres inmobiliaria?'",
        text: `¡Hola, {{CLIENT_NAME}}! Buenos días. Soy Alex Aldazabal, Asesor Inmobiliario en Dénia 🤝.
Voy directo al grano:
Actualmente, gestiono una cartera selecta de compradores nacionales e internacionales que están buscando activamente propiedades con las características como la suya.

●      Mi Propuesta: En una visita rápida de 20 minutos, le muestro mi Plan de Acción Exclusivo (marketing premium y segmentación avanzada) que garantiza una venta rápida y al mejor precio del mercado.

●      Sin Compromiso: Si mi plan le convence, será un placer ayudarle a vender su propiedad y si no le agradecía por su tiempo.

¿Podríamos agendar esos 20 minutos esta semana para analizar el potencial de su inmueble?

Un cordial saludo, y quedo a su disposición.`
    },

    // 3. Gestión de Silencios (Secuencia)
    silence_1: {
        label: "3a. Silencio (Intento 1)",
        text: `Este es el anuncio, ¿es correcto? ¿Sigue disponible?`
    },
    silence_2: {
        label: "3b. Silencio (Intento 2)",
        text: `Perdón ¿Sigue a la venta?`
    },
    silence_3: {
        label: "3c. Silencio (Último Intento)",
        text: `Hola de nuevo, no quiero molestar, este es mi último mensaje, si sigue a la venta, mi cliente estará encantada de saber más de su propiedad, si no está disponible o no le interesa, perdón por la molestias 😊✌️`
    },

    // 4. Gestión de Negativas ("No agencias" Educado)
    refusal_polite: {
        label: "4a. Negativa Educada ('Solo particulares')",
        text: `Hola 🙂
He visto su publicación y también su indicación de que prefiere gestionar la venta de su propiedad de forma particular.
Entiendo y respeto completamente su decisión. Le deseo mucho éxito en el proceso.

No obstante, si en algún punto del camino las circunstancias cambian o si valora que un apoyo profesional podría ahorrarle tiempo y garantizar el mejor precio, sepa que tengo las herramientas necesarias para facilitarle la venta de su propiedad, la posibilidad de captar clientes nacionales e internacionales y estoy a su disposición para una conversación sin compromiso.

Sin más,  Alex Aldazabal asesor inmobiliario independiente de iAD España.
Gracias 🙂`
    },

    // 5. Gestión de Negativas Directas (Rechazo explícito)
    refusal_direct: {
        label: "4b. Negativa Directa ('No quiero agencias')",
        text: `Entiendo su decisión de vender su propiedad sin ayuda profesional, de igual forma me presento:
Soy Alex Aldazabal, asesor inmobiliario Independiente.

Si en algún momento del proceso de la venta cambia de opinión recuerde que puede contar con mis servicios inmobiliarios, tengo la posibilidad de captar clientes nacionales e internacionales , interesados en inmuebles con las características del que usted tiene en venta.

Quedo a su disposición. ¡Un saludo y que tenga un excelente día!
Gracias 🙂`
    }
};

module.exports = whatsappScripts;
