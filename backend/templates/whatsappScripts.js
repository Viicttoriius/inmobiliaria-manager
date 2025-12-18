const whatsappScripts = {
    initial_contact: {
        label: "Contacto Inicial (General)",
        text: `Hola, buenos días.  
Soy Alex Aldazabal Dufurneaux, agente inmobiliario en IAD, estoy ubicado en Dénia. Me pongo en contacto porque tengo clientes interesados en inmuebles con las características del que usted tiene en venta. 

¿Podríamos concertar una visita para conocerlo? Así podré presentarlo correctamente y ofrecerle una opción de venta rápida, segura y sin compromiso. 

Trabajo con una estrategia de marketing muy efectiva y siempre priorizo un trato directo y transparente. 

Quedo a su disposición. ¡Un saludo y que tenga un excelente día! 

Alex – IAD Inmobiliaria`
    },
    objection_agency: {
        label: "Objeción: ¿Eres agencia?",
        text: `¡Hola! Soy Alex Aldazabal, tu Agente Inmobiliario en Dénia 🤝. 

Le contacto porque tengo la posibilidad de captar clientes (nacionales e internacionales) buscando activamente una propiedad con las características exactas de la suya. 

Mi compromiso: Asegurar una venta rápida y al mejor precio. 

Como experto local, le ofrezco: 

🥇 Clientes Cualificados: Compradores listos para cerrar la operación. 

📈 Valoración de Mercado Real: Para vender sin perder tiempo ni dinero. 

🔒 Gestión Segura y Transparente (sin ataduras). 

¿Podríamos agendar una visita rápida esta semana para conocer su inmueble y presentarle mi plan de acción sin compromiso? 

Mi objetivo es que venda de forma sencilla y segura. 

Quedo a su disposición. ¡Un saludo!`
    },
    followup_15min: {
        label: "Seguimiento (< 15 min) - Respuesta rápida",
        text: `¡Hola, buenos días! 👋 

Soy Alex Aldazabal, Agente Inmobiliario Independiente 🏡, y estoy en Dénia. 

Me pongo en contacto porque tengo la posibilidad de captar clientes 🎯, interesados en inmuebles con las características del que usted tiene en venta, tanto nacionales 🇪🇸 como internacionales 🌍. ¡Tenemos una cartera de clientes muy amplia! 😉 

¿Podríamos concertar una visita para conocerlo? 🗓️ Así podré presentarlo correctamente y ofrecerle una opción de venta rápida 🚀, segura 🛡️ y sin compromiso ✅. 

Quedo a su disposición para cualquier duda. 

¡Un saludo cordial y que tenga un excelente día! ☀️😊 
Alex`
    },
    followup_20min: {
        label: "Seguimiento (< 20 min) - Ya vendido/No interesa",
        text: `Buenos días, 

Gracias por su respuesta. Lo entiendo perfectamente. 

Quedo a su disposición por si en el futuro cambia de opinión o necesita cualquier tipo de asesoramiento inmobiliario, sin compromiso. 

Le deseo lo mejor con la venta y que tenga un excelente día. 

Un saludo cordial,  
Alex Aldazabal Dufurneaux  
Agente Inmobiliario – IAD España`
    },
    followup_next_day: {
        label: "Seguimiento (Día siguiente) - Último intento",
        text: `Hola, muy buenas.  
Espero que todo esté yendo bien.  
Solo quería consultar si sigue en pie la venta del apartamento del que hablamos hace un tiempo.  
Quedo a tu disposición por si necesitas apoyo en cualquier momento. 

Un saludo cordial,  
Alex – IAD Inmobiliaria`
    },
    specific_link: {
        label: "Contacto Específico (con Link)",
        text: `Hola, buenos días, Sr. Pedro 
Soy Alex Aldazabal Dufurneaux, agente inmobiliario en IAD, estoy ubicado en Dénia,le contacté hace unos días porque vi su publicación 
{{LINK}} 
Reitero mi interés en ayudarte. Hay un punto clave que nos diferencia y que te beneficiaría: 

La mayoría solo publica en portales nacionales... nosotros vamos más allá. Tu propiedad podría estar ahora mismo visible en 85 portales, cubriendo 51 países (¡gracias a nuestra tecnología PRO). 
Esto multiplica la posibilidad de encontrar al comprador ideal. 
para mí será un placer ayudarle, estoy a su disposición que tenga un excelente día.`
    }
};

module.exports = whatsappScripts;
