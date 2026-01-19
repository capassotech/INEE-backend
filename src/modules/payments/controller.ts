import { Request, Response } from "express";
import { firestore } from '../../config/firebase';
import { Resend } from "resend";
import { MercadoPagoConfig, Payment, PaymentMethod } from "mercadopago";
import { createOrder, updateOrderStatus } from "../orders/controller";
import crypto from 'crypto';
import axios from 'axios';


const mpClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
    options: {
        timeout: 5000
    }
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const createPayment = async (req: Request, res: Response) => {
    try {
        if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
            console.error('❌ MERCADO_PAGO_ACCESS_TOKEN no configurado');
            return res.status(500).json({
                success: false,
                error: "Error de configuración del servidor"
            });
        }

        const {
            items,
            metadata,
            token,
            installments = 1,
            paymentMethodId,
            issuerId,
            bin,
            cardType, // "debito", "credito", "prepaga"
            cardholderName,
            identificationType,
            identificationNumber,
            deviceId,
            device_id
        } = req.body;

        const finalDeviceId = device_id || deviceId;
        
        // Log inicial de la request
        console.log('📥 Request recibida:', {
            hasToken: !!token,
            paymentMethodId,
            issuerId: issuerId || 'NO PROPORCIONADO',
            bin: bin || 'NO PROPORCIONADO',
            hasItems: !!items && items.length > 0,
            transactionAmount: metadata.totalAmount,
            itemsCount: items?.length || 0,
            itemsDetails: items?.map((item: any) => ({
                id: item.id || item.productId || 'NO ID',
                nombre: item.nombre || item.title || item.name || 'NO NOMBRE',
                precio: item.precio || item.price || item.unit_price || 'NO PRECIO',
                quantity: item.quantity || 1
            })) || []
        });

        if (!metadata.userId || !Array.isArray(items) || items.length === 0 || !metadata.totalAmount) {
            return res.status(400).json({ error: "Faltan datos de la orden (userId, items, totalPrice)" });
        }

        if (!token || !paymentMethodId) {
            return res.status(400).json({ 
                success: false,
                error: "Faltan datos de pago (token, paymentMethodId)",
                details: `Token: ${token ? 'presente' : 'faltante'}, PaymentMethodId: ${paymentMethodId ? 'presente' : 'faltante'}`
            });
        }
        
        // Validar que el token no esté vacío o sea inválido
        if (typeof token !== 'string' || token.trim() === '' || token === 'undefined' || token === 'null') {
            return res.status(400).json({
                success: false,
                error: "Token de tarjeta inválido",
                details: "El token de la tarjeta no es válido. Por favor, ingresa los datos de la tarjeta nuevamente."
            });
        }

        if (!issuerId || issuerId === 'undefined' || issuerId === 'null' || issuerId === '') {
            console.warn('⚠️  ADVERTENCIA: issuerId no proporcionado por el frontend');
            console.warn('⚠️  Esto causará error "not_result_by_params" con tarjetas de débito bancarizadas');
            console.warn('⚠️  El frontend DEBE obtener el issuerId del token de Mercado Pago');
            // No retornamos error aquí porque algunas tarjetas pueden funcionar sin issuerId
            // Pero el error se detectará cuando Mercado Pago rechace el pago
        }

        const user = await firestore.collection('users').doc(metadata.userId).get();
        if (!user.exists) {
            return res.status(400).json({ error: "Usuario no encontrado" });
        }

        if (!await validateProds(items)) {
            return res.status(400).json({ error: "Productos no encontrados" });
        }

        const total = await calculateTotalPrice(items);
        const transactionAmount = total || metadata.totalAmount;

        if (isNaN(transactionAmount) || transactionAmount <= 0) {
            return res.status(400).json({
                error: "El monto de la transacción es inválido",
                details: `Monto calculado: ${total}, Monto metadata: ${metadata.totalAmount}`
            });
        }

        const { orderId, orderNumber } = await createOrder(metadata.userId, items, transactionAmount, 'pending');

        const isProduction = !process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('TEST-');
        const baseUrl = isProduction
            ? (process.env.WEBHOOK_BASE_URL || 'https://inee-backend.onrender.com')
            : 'https://inee-backend-qa.onrender.com';
        const webhookUrl = `${baseUrl}/api/payments/mercadopago/webhook`;

        const userData = user.data();

        // Log para debugging
        console.log('🔍 Payment data:', {
            token: token ? `${token.substring(0, 10)}...` : 'MISSING',
            tokenLength: token?.length || 0,
            paymentMethodId,
            issuerId: issuerId || 'NOT PROVIDED',
            bin: bin || 'NOT PROVIDED',
            orderId,
            orderNumber
        });

        // NOTA: El payment_method_id puede ser incorrecto (ej: "visa" en lugar de "debvisa")
        // Lo verificaremos y corregiremos más adelante usando el BIN
        const paymentData: any = {
            transaction_amount: Number(transactionAmount),
            token,
            description: `Compra INEE - Orden ${orderNumber}`,
            installments: Number(installments),
            payment_method_id: paymentMethodId, // Puede ser incorrecto, se verificará más adelante
            external_reference: orderNumber,
            statement_descriptor: "INEE",
            notification_url: webhookUrl,
            payer: {
                entity_type: "individual",
                type: "customer",
                email: userData?.email || '',
                identification: {
                    type: identificationType || 'DNI',
                    number: String(identificationNumber || '')
                }
            }
        };
        
        console.log('🔍 Payment method ID recibido del frontend:', paymentMethodId);
        console.log('🔍 BIN recibido del frontend:', bin);
        
        // issuer_id se agregará más adelante si está disponible

        if (items && items.length > 0) {
            paymentData.additional_info = {
                items: items.map((item: any) => ({
                    id: String(item.id || ''),
                    title: String(item.nombre || item.title || 'Producto'),
                    description: String(item.description || `Producto: ${item.nombre || item.title}`),
                    category_id: 'education',
                    quantity: Number(item.quantity || 1),
                    unit_price: Number(item.precio || item.price || 0),
                })),
                payer: {
                    first_name: userData?.nombre || '',
                    last_name: userData?.apellido || '',
                },
                ip_address: req.ip || req.headers['x-forwarded-for'] || '',
            };
        }

        // CRÍTICO: Verificar primero si el payment_method_id es correcto para el BIN
        // Si el payment_method_id no es correcto, el pago fallará con "not_result_by_params"
        let verifiedPaymentMethodId = paymentMethodId;
        let issuerIdObtained = false;
        const hasManualSelection = issuerId && issuerId !== 'undefined' && issuerId !== 'null' && issuerId !== '' && issuerId.trim() !== '';
        
        console.log(`🔍 DEBUG: hasManualSelection = ${hasManualSelection}, issuerId = "${issuerId}", cardType = "${cardType}"`);
        
        // Si el usuario seleccionó el tipo de tarjeta, usar esa información para determinar el payment_method_id correcto
        if (cardType && paymentMethodId) {
            let correctedPaymentMethodId: string | null = null;
            
            if (cardType === 'debito') {
                // Para tarjetas de débito, usar "debvisa" o "debmaster"
                if (paymentMethodId === 'visa' || paymentMethodId.toLowerCase().includes('visa')) {
                    correctedPaymentMethodId = 'debvisa';
                } else if (paymentMethodId === 'master' || paymentMethodId.toLowerCase().includes('master')) {
                    correctedPaymentMethodId = 'debmaster';
                }
            } else if (cardType === 'credito') {
                // Para tarjetas de crédito, mantener el payment_method_id original
                correctedPaymentMethodId = paymentMethodId;
            } else if (cardType === 'prepaga') {
                // Para tarjetas prepagas, mantener el payment_method_id original
                correctedPaymentMethodId = paymentMethodId;
            }
            
            if (correctedPaymentMethodId && correctedPaymentMethodId !== paymentMethodId) {
                console.log(`✅ Corrigiendo payment_method_id de "${paymentMethodId}" a "${correctedPaymentMethodId}" basado en tipo de tarjeta: ${cardType}`);
                paymentData.payment_method_id = correctedPaymentMethodId;
                verifiedPaymentMethodId = correctedPaymentMethodId;
            } else if (correctedPaymentMethodId) {
                console.log(`✅ Payment method ID "${paymentMethodId}" es correcto para tipo de tarjeta: ${cardType}`);
            }
        }
        
        // SIEMPRE verificar el payment_method_id correcto del BIN
        // Primero intentar obtenerlo desde payment_methods/search, luego validar con installments
        if (bin && bin.length >= 6) {
            console.log('🔍 Verificando payment_method_id correcto para el BIN:', bin);
            const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
            const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
            
            if (accessToken) {
                // PRIMERO: Intentar obtener el payment_method_id correcto desde payment_methods/search
                // Este endpoint puede funcionar con access_token si incluimos public_key
                let correctPaymentMethodIdFromSearch: string | null = null;
                
                if (publicKey) {
                    try {
                        const searchUrl = `https://api.mercadopago.com/v1/payment_methods/search?public_key=${publicKey}&marketplace=NONE&bin=${bin}`;
                        console.log('📡 Obteniendo payment_method_id desde payment_methods/search:', searchUrl);
                        
                        const searchResponse = await axios.get(searchUrl, { timeout: 5000 });
                        
                        console.log('📦 Respuesta de payment_methods/search:', JSON.stringify(searchResponse.data, null, 2));
                        
                        if (searchResponse.data) {
                            if (searchResponse.data.results && Array.isArray(searchResponse.data.results) && searchResponse.data.results.length > 0) {
                                const firstResult = searchResponse.data.results[0];
                                if (firstResult && firstResult.payment_method_id) {
                                    correctPaymentMethodIdFromSearch = firstResult.payment_method_id;
                                    console.log(`✅ Payment method ID obtenido desde search: "${correctPaymentMethodIdFromSearch}"`);
                                }
                            } else if (searchResponse.data.payment_method_id) {
                                correctPaymentMethodIdFromSearch = searchResponse.data.payment_method_id;
                                console.log(`✅ Payment method ID obtenido desde search: "${correctPaymentMethodIdFromSearch}"`);
                            }
                        }
                    } catch (searchError: any) {
                        console.warn('⚠️ Error al obtener payment_method_id desde search:', searchError?.response?.status, searchError?.response?.data || searchError.message);
                    }
                } else {
                    console.warn('⚠️ MERCADO_PAGO_PUBLIC_KEY no está configurado. No se puede obtener payment_method_id desde search.');
                }
                
                // Si obtuvimos un payment_method_id desde search, usarlo SIEMPRE (incluso si es igual al recibido)
                // Esto asegura que estamos usando el payment_method_id correcto para el BIN
                if (correctPaymentMethodIdFromSearch) {
                    if (correctPaymentMethodIdFromSearch !== paymentMethodId) {
                        console.log(`✅ Usando payment_method_id obtenido desde search: "${correctPaymentMethodIdFromSearch}" (en lugar de "${paymentMethodId}")`);
                    } else {
                        console.log(`✅ Payment method ID desde search coincide con el recibido: "${correctPaymentMethodIdFromSearch}"`);
                    }
                    paymentData.payment_method_id = correctPaymentMethodIdFromSearch;
                    verifiedPaymentMethodId = correctPaymentMethodIdFromSearch;
                }
                
                // SEGUNDO: Validar el payment_method_id (ya sea el corregido por cardType, el obtenido desde search, o el original) con installments
                try {
                    // Usar el payment_method_id corregido si existe, sino el de search, sino el original
                    const paymentMethodToValidate = verifiedPaymentMethodId || correctPaymentMethodIdFromSearch || paymentMethodId;
                    const installmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${paymentMethodToValidate}&bin=${bin}`;
                    console.log('📡 Verificando payment_method_id con installments:', installmentsUrl);
                    console.log(`🔍 Payment method a validar: "${paymentMethodToValidate}" (corregido: ${verifiedPaymentMethodId}, desde search: ${correctPaymentMethodIdFromSearch}, original: ${paymentMethodId})`);
                    
                    const installmentsResponse = await axios.get(installmentsUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        },
                        timeout: 5000
                    });
                    
                    console.log('📦 Respuesta de installments (verificación):', JSON.stringify(installmentsResponse.data, null, 2));
                    
                    // La respuesta de installments puede ser un array o un objeto
                    let installmentsData = installmentsResponse.data;
                    let payerCosts = null;
                    
                    if (Array.isArray(installmentsData) && installmentsData.length > 0) {
                        // Si es un array, tomar el primer elemento
                        installmentsData = installmentsData[0];
                        payerCosts = installmentsData.payer_costs;
                    } else if (installmentsData && installmentsData.payer_costs) {
                        // Si es un objeto con payer_costs
                        payerCosts = installmentsData.payer_costs;
                    }
                    
                    if (payerCosts && Array.isArray(payerCosts) && payerCosts.length > 0) {
                        console.log(`✅ El payment_method_id "${paymentMethodToValidate}" es válido para este BIN.`);
                        
                        // Para tarjetas de débito (debvisa, debmaster), usar issuer_id SOLO si lo obtenemos automáticamente
                        // Para tarjetas prepagas, NO enviar issuer_id en absoluto (pueden quedar pendientes)
                        // NO usar issuer_id manual para débito (puede causar pending_review_manual)
                        // Pero SÍ usar issuer_id obtenido automáticamente de installments (es confiable)
                        const isDebitCard = paymentMethodToValidate === 'debvisa' || paymentMethodToValidate === 'debmaster';
                        const isPrepaidCard = cardType === 'prepaga';
                        
                        if (isDebitCard) {
                            console.log('💡 Para tarjetas de débito, usar issuer_id SOLO si se obtiene automáticamente de installments.');
                            console.log('💡 NO usar issuer_id manual para evitar pending_review_manual.');
                            
                            // Para débito, usar issuer_id SOLO si lo obtenemos automáticamente de installments
                            // NO usar issuer_id manual (puede causar pending_review_manual)
                            if (installmentsData.issuer && installmentsData.issuer.id) {
                                paymentData.issuer_id = installmentsData.issuer.id.toString();
                                issuerIdObtained = true;
                                console.log(`✅ Issuer ID obtenido automáticamente de installments para débito: ${paymentData.issuer_id}`);
                            } else if (payerCosts[0] && payerCosts[0].issuer && payerCosts[0].issuer.id) {
                                paymentData.issuer_id = payerCosts[0].issuer.id.toString();
                                issuerIdObtained = true;
                                console.log(`✅ Issuer ID obtenido automáticamente de payer_costs para débito: ${paymentData.issuer_id}`);
                            } else {
                                // Si no se puede obtener automáticamente, NO usar issuer_id manual
                                console.log('💡 No se pudo obtener issuer_id automáticamente. NO se usará issuer_id manual.');
                                console.log('💡 Mercado Pago determinará el issuer_id desde el token.');
                                delete paymentData.issuer_id;
                                issuerIdObtained = false;
                            }
                        } else if (isPrepaidCard) {
                            console.log('💡 Para tarjetas prepagas, NO enviar issuer_id a Mercado Pago.');
                            console.log('💡 Las tarjetas prepagas no requieren issuer_id y puede causar que queden pendientes.');
                            
                            // Para tarjetas prepagas, NO establecer issuer_id en absoluto
                            // Las tarjetas prepagas no requieren issuer_id y enviarlo puede causar que queden pendientes
                            delete paymentData.issuer_id;
                            issuerIdObtained = false;
                            console.log('✅ issuer_id NO se establecerá para tarjetas prepagas. Mercado Pago procesará el pago sin issuer_id.');
                        } else {
                            // Para tarjetas de crédito, obtener issuer_id de la respuesta si está disponible
                            if (installmentsData.issuer && installmentsData.issuer.id && !hasManualSelection) {
                                paymentData.issuer_id = installmentsData.issuer.id.toString();
                                issuerIdObtained = true;
                                console.log(`✅ Issuer ID obtenido de installments: ${paymentData.issuer_id}`);
                            } else if (payerCosts[0] && payerCosts[0].issuer && payerCosts[0].issuer.id && !hasManualSelection) {
                                paymentData.issuer_id = payerCosts[0].issuer.id.toString();
                                issuerIdObtained = true;
                                console.log(`✅ Issuer ID obtenido de payer_costs: ${paymentData.issuer_id}`);
                            }
                        }
                    } else {
                        console.warn(`⚠️ El payment_method_id "${paymentMethodToValidate}" no devolvió resultados válidos para este BIN.`);
                        console.warn('⚠️ Esto puede indicar que el payment_method_id es incorrecto para este BIN.');
                    }
                } catch (installmentsError: any) {
                    if (installmentsError?.response?.status === 404) {
                        console.error(`❌ El payment_method_id "${paymentMethodId}" NO es válido para el BIN ${bin}.`);
                        console.error('❌ Mercado Pago no reconoce esta combinación de payment_method_id y BIN.');
                        console.error('🔄 Intentando obtener el payment_method_id correcto desde el BIN...');
                        
                        // Intentar obtener el payment_method_id correcto probando con diferentes métodos comunes
                        // Lista más completa de métodos de pago de Mercado Pago
                        const commonPaymentMethods = [
                            'debvisa', 'debmaster', 'visa', 'master', 'amex', 'diners',
                            'argencard', 'cabal', 'cencosud', 'cmr', 'cordobesa', 'cordobesa_visa',
                            'cordobesa_master', 'naranja', 'nativa', 'nativa_visa', 'nativa_master',
                            'shopping', 'tarshop', 'tarshop_visa', 'tarshop_master', 'visadebit',
                            'masterdebit', 'maestro', 'visa_credito', 'master_credito'
                        ];
                        let correctPaymentMethodId: string | null = null;
                        
                        for (const method of commonPaymentMethods) {
                            if (method === paymentMethodId) continue; // Ya probamos este
                            
                            try {
                                const testUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${method}&bin=${bin}`;
                                console.log(`🔄 Probando payment_method_id "${method}" para el BIN ${bin}...`);
                                
                                const testResponse = await axios.get(testUrl, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`
                                    },
                                    timeout: 5000
                                });
                                
                                if (testResponse.data && testResponse.data.payer_costs && testResponse.data.payer_costs.length > 0) {
                                    correctPaymentMethodId = method;
                                    console.log(`✅ Payment method ID correcto encontrado: "${method}"`);
                                    break;
                                }
                            } catch (testError: any) {
                                // Continuar con el siguiente método
                                continue;
                            }
                        }
                        
                        // Si aún no encontramos uno, intentar obtener todos los métodos disponibles desde card_issuers
                        if (!correctPaymentMethodId) {
                            console.log('🔄 Intentando obtener métodos de pago disponibles desde card_issuers...');
                            try {
                                // Obtener todos los métodos de pago disponibles
                                const allMethodsUrl = `https://api.mercadopago.com/v1/payment_methods?marketplace=NONE`;
                                const allMethodsResponse = await axios.get(allMethodsUrl, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`
                                    },
                                    timeout: 5000
                                });
                                
                                if (allMethodsResponse.data && Array.isArray(allMethodsResponse.data)) {
                                    console.log(`📋 Encontrados ${allMethodsResponse.data.length} métodos de pago disponibles. Probando con el BIN...`);
                                    
                                    // Probar con los primeros 30 métodos (para no hacer demasiadas requests)
                                    const methodsToTest = allMethodsResponse.data.slice(0, 30);
                                    for (const methodData of methodsToTest) {
                                        const methodId = methodData.id;
                                        if (!methodId || methodId === paymentMethodId) continue;
                                        
                                        try {
                                            const testUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${methodId}&bin=${bin}`;
                                            const testResponse = await axios.get(testUrl, {
                                                headers: {
                                                    'Authorization': `Bearer ${accessToken}`
                                                },
                                                timeout: 3000
                                            });
                                            
                                            if (testResponse.data && testResponse.data.payer_costs && testResponse.data.payer_costs.length > 0) {
                                                correctPaymentMethodId = methodId;
                                                console.log(`✅ Payment method ID correcto encontrado: "${methodId}"`);
                                                break;
                                            }
                                        } catch (testError: any) {
                                            continue;
                                        }
                                    }
                                }
                            } catch (allMethodsError: any) {
                                console.warn('⚠️ No se pudieron obtener todos los métodos de pago:', allMethodsError?.response?.status || allMethodsError.message);
                            }
                        }
                        
                        if (correctPaymentMethodId) {
                            console.log(`✅ Corrigiendo payment_method_id de "${paymentMethodId}" a "${correctPaymentMethodId}"`);
                            paymentData.payment_method_id = correctPaymentMethodId;
                            verifiedPaymentMethodId = correctPaymentMethodId;
                            
                            // Intentar obtener el issuer_id con el payment_method_id correcto
                            try {
                                const correctInstallmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${correctPaymentMethodId}&bin=${bin}`;
                                const correctResponse = await axios.get(correctInstallmentsUrl, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`
                                    },
                                    timeout: 5000
                                });
                                
                                if (correctResponse.data && correctResponse.data.payer_costs && correctResponse.data.payer_costs.length > 0) {
                                    const payerCost = correctResponse.data.payer_costs[0];
                                    if (payerCost && payerCost.issuer && payerCost.issuer.id && !hasManualSelection) {
                                        paymentData.issuer_id = payerCost.issuer.id.toString();
                                        issuerIdObtained = true;
                                        console.log(`✅ Issuer ID obtenido con payment_method_id correcto: ${paymentData.issuer_id}`);
                                    }
                                }
                            } catch (correctError: any) {
                                console.warn('⚠️ No se pudo obtener issuer_id con el payment_method_id correcto');
                            }
                        } else {
                            console.error('❌ No se pudo encontrar un payment_method_id válido para este BIN después de probar múltiples métodos.');
                            console.error('❌ Posibles causas:');
                            console.error('   - El BIN no está registrado en Mercado Pago');
                            console.error('   - El token de la tarjeta no corresponde a este BIN');
                            console.error('   - La tarjeta no es compatible con Mercado Pago');
                            console.error('🔄 Intentando obtener payment_method_id desde el token de Mercado Pago...');
                            
                            // Intentar obtener información del token desde la API de Mercado Pago
                            // Nota: La API de Mercado Pago no permite consultar tokens directamente por seguridad
                            // Pero podemos intentar crear el pago sin payment_method_id y dejar que Mercado Pago lo determine
                            // O podemos intentar sin issuer_id también
                            
                            console.warn('⚠️ No se pudo determinar el payment_method_id correcto desde el BIN.');
                            
                            // CRÍTICO: Si ya tenemos un payment_method_id corregido (por ejemplo, "debvisa" por cardType), mantenerlo
                            // NO restaurar el payment_method_id original si ya fue corregido
                            if (verifiedPaymentMethodId && verifiedPaymentMethodId !== paymentMethodId) {
                                console.log(`✅ Manteniendo payment_method_id corregido: "${verifiedPaymentMethodId}" (no se restaurará "${paymentMethodId}")`);
                                paymentData.payment_method_id = verifiedPaymentMethodId;
                                
                                // Si hay selección manual de issuer, usarla con el payment_method_id corregido
                                // PERO NO para tarjetas prepagas (pueden quedar pendientes)
                                const isPrepaidCardType = cardType === 'prepaga';
                                if (hasManualSelection && !isPrepaidCardType) {
                                    paymentData.issuer_id = String(issuerId);
                                    console.log(`✅ Usando issuer_id seleccionado manualmente: ${issuerId}`);
                                } else {
                                    // Eliminar issuer_id para que Mercado Pago lo determine
                                    delete paymentData.issuer_id;
                                    if (isPrepaidCardType) {
                                        console.log('💡 Tarjeta prepaga. NO se enviará issuer_id para evitar que quede pendiente.');
                                    } else {
                                        console.log('⚠️ No se enviará issuer_id. Mercado Pago lo determinará automáticamente.');
                                    }
                                }
                            } else if (paymentMethodId && paymentMethodId !== 'undefined' && paymentMethodId !== 'null') {
                                console.log(`⚠️ Usando payment_method_id del token/frontend: "${paymentMethodId}"`);
                                console.log('⚠️ Aunque no es válido para el BIN según installments, el token puede tener la información correcta.');
                                paymentData.payment_method_id = paymentMethodId;
                                
                                // Si hay selección manual de issuer, usarla con el payment_method_id del token
                                // PERO NO para tarjetas prepagas (pueden quedar pendientes)
                                const isPrepaidCardType = cardType === 'prepaga';
                                if (hasManualSelection && !isPrepaidCardType) {
                                    paymentData.issuer_id = String(issuerId);
                                    console.log(`✅ Usando issuer_id seleccionado manualmente: ${issuerId}`);
                                } else {
                                    // Eliminar issuer_id para que Mercado Pago lo determine
                                    delete paymentData.issuer_id;
                                    if (isPrepaidCardType) {
                                        console.log('💡 Tarjeta prepaga. NO se enviará issuer_id para evitar que quede pendiente.');
                                    } else {
                                        console.log('⚠️ No se enviará issuer_id. Mercado Pago lo determinará automáticamente.');
                                    }
                                }
                            } else {
                                // Si no hay payment_method_id del frontend, eliminar ambos
                                console.warn('⚠️ No hay payment_method_id disponible. Intentando crear el pago sin payment_method_id y sin issuer_id.');
                                console.warn('⚠️ Mercado Pago intentará determinarlos automáticamente desde el token.');
                                delete paymentData.payment_method_id;
                                delete paymentData.issuer_id;
                            }
                            
                            console.log('📤 Payment data modificado:', {
                                hasToken: !!paymentData.token,
                                payment_method_id: paymentData.payment_method_id || 'NO ENVIADO',
                                issuer_id: paymentData.issuer_id || 'NO ENVIADO',
                                transaction_amount: paymentData.transaction_amount,
                                installments: paymentData.installments
                            });
                        }
                    } else {
                        console.warn('⚠️ Error al verificar payment_method_id con installments:', installmentsError?.response?.status, installmentsError?.response?.data || installmentsError.message);
                    }
                }
            } else {
                console.warn('⚠️ MERCADO_PAGO_ACCESS_TOKEN no está configurado. No se puede verificar el payment_method_id del BIN.');
            }
        }
        
        // Solo usar issuer_id manual si tenemos un payment_method_id válido
        // PERO NO para tarjetas de débito ni prepagas (para evitar pending_review_manual o que queden pendientes)
        // Si no tenemos payment_method_id, no enviar issuer_id porque puede ser incorrecto
        const isDebitCardFinal = paymentData.payment_method_id === 'debvisa' || paymentData.payment_method_id === 'debmaster';
        const isPrepaidCardFinal = cardType === 'prepaga';
        
        if (hasManualSelection && paymentData.payment_method_id && !isDebitCardFinal && !isPrepaidCardFinal) {
            // Si el usuario seleccionó manualmente un issuer y tenemos payment_method_id válido, usarlo
            // PERO NO para tarjetas de débito ni prepagas (para evitar problemas)
            // El usuario sabe mejor qué banco emitió su tarjeta
            console.log(`✅ Usando issuer_id seleccionado manualmente por el usuario: ${issuerId}`);
            paymentData.issuer_id = String(issuerId);
            issuerIdObtained = true;
            console.log(`✅ issuer_id establecido en paymentData: ${paymentData.issuer_id}`);
        } else if (hasManualSelection && paymentData.payment_method_id && (isDebitCardFinal || isPrepaidCardFinal)) {
            // Para tarjetas de débito y prepagas, NO usar issuer_id en absoluto (ni manual ni automático)
            if (isDebitCardFinal) {
                if (issuerIdObtained) {
                    console.log('💡 Para tarjetas de débito, ya tenemos issuer_id automático. NO se usará el manual.');
                    console.log('💡 Esto permite que Mercado Pago apruebe automáticamente sin pending_review_manual.');
                    // Mantener el issuer_id automático, no usar el manual
                } else {
                    console.log('⚠️ Para tarjetas de débito, no se pudo obtener issuer_id automático.');
                    console.log('⚠️ Usando issuer_id manual como último recurso (puede causar pending_review_manual).');
                    paymentData.issuer_id = String(issuerId);
                    issuerIdObtained = true;
                }
            } else {
                console.log('💡 Para tarjetas prepagas, NO se usará issuer_id (ni manual ni automático).');
                console.log('💡 Las tarjetas prepagas no requieren issuer_id y puede causar que queden pendientes.');
                delete paymentData.issuer_id;
                issuerIdObtained = false;
            }
        } else if (hasManualSelection && !paymentData.payment_method_id) {
            console.warn('⚠️ No se usará el issuer_id seleccionado manualmente porque no hay payment_method_id válido.');
            console.warn('⚠️ Mercado Pago determinará ambos automáticamente desde el token.');
            delete paymentData.issuer_id;
        } else if (bin && bin.length >= 6) {
            console.log('🔄 Intentando obtener issuer_id CORRECTO del BIN usando access token...', { 
                bin, 
                paymentMethodId, 
                issuerIdProvided: issuerId,
                transactionAmount 
            });
            
            // Método 1: Intentar con payment_methods/search (sin payment_method_id para obtener todos)
            try {
                const searchUrl = `https://api.mercadopago.com/v1/payment_methods/search?marketplace=NONE&bin=${bin}`;
                console.log('📡 Llamando a (método 1):', searchUrl);
                const searchResponse = await axios.get(searchUrl, {
                    headers: {
                        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
                    }
                });
                
                console.log('📦 Respuesta de payment_methods/search:', JSON.stringify(searchResponse.data, null, 2));
                
                if (searchResponse.data) {
                    let foundIssuerId = null;
                    
                    // Estructura 1: results array (nueva API)
                    if (searchResponse.data.results && Array.isArray(searchResponse.data.results) && searchResponse.data.results.length > 0) {
                        // Buscar el resultado que coincida con el payment_method_id
                        const matchingResult = searchResponse.data.results.find((result: any) => 
                            result.payment_method_id === paymentMethodId || result.id === paymentMethodId
                        );
                        
                        if (matchingResult) {
                            // Intentar obtener issuer_id de diferentes lugares en el resultado
                            if (matchingResult.issuer && matchingResult.issuer.id) {
                                foundIssuerId = matchingResult.issuer.id.toString();
                            } else if (matchingResult.issuer_id) {
                                foundIssuerId = matchingResult.issuer_id.toString();
                            } else if (matchingResult.additional_info_needed && matchingResult.additional_info_needed.includes('issuer_id')) {
                                // Si necesita issuer_id, buscar en los issuers disponibles
                                if (matchingResult.issuers && Array.isArray(matchingResult.issuers) && matchingResult.issuers.length > 0) {
                                    foundIssuerId = matchingResult.issuers[0].id.toString();
                                }
                            }
                        }
                    }
                    
                    // Estructura 2: respuesta directa (API antigua)
                    if (!foundIssuerId) {
                        if (searchResponse.data.issuer && searchResponse.data.issuer.id) {
                            foundIssuerId = searchResponse.data.issuer.id.toString();
                        } else if (searchResponse.data.issuer_id) {
                            foundIssuerId = searchResponse.data.issuer_id.toString();
                        }
                    }
                    
                    if (foundIssuerId) {
                        paymentData.issuer_id = foundIssuerId;
                        issuerIdObtained = true;
                        console.log('✅ Issuer ID obtenido del BIN (método 1):', foundIssuerId);
                    } else {
                        console.warn('⚠️ Método 1: No se encontró issuer_id en la respuesta');
                    }
                }
            } catch (searchError: any) {
                console.warn('⚠️ Error en método 1 (payment_methods/search):', searchError?.response?.status, searchError?.response?.data || searchError.message);
            }
            
            // Método 2: Intentar con card_issuers (sin BIN primero, luego con BIN)
            if (!issuerIdObtained) {
                try {
                    // Primero intentar sin BIN para obtener todos los issuers disponibles
                    const issuersUrl = `https://api.mercadopago.com/v1/payment_methods/card_issuers?payment_method_id=${paymentMethodId}`;
                    console.log('📡 Llamando a (método 2a - sin BIN):', issuersUrl);
                    const issuersResponse = await axios.get(issuersUrl, {
                        headers: {
                            'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
                        }
                    });
                    
                    console.log('📦 Respuesta de card_issuers (sin BIN):', JSON.stringify(issuersResponse.data, null, 2));
                    
                    if (issuersResponse.data && Array.isArray(issuersResponse.data) && issuersResponse.data.length > 0) {
                        // Si solo hay un issuer, usarlo directamente
                        if (issuersResponse.data.length === 1) {
                            const issuer = issuersResponse.data[0];
                            if (issuer && issuer.id) {
                                paymentData.issuer_id = issuer.id.toString();
                                issuerIdObtained = true;
                                console.log('✅ Issuer ID obtenido del BIN (método 2a - único issuer):', paymentData.issuer_id);
                            }
                        } else {
                            // Si hay múltiples issuers, intentar usar instalments para encontrar el correcto
                            console.log(`📋 Hay ${issuersResponse.data.length} issuers disponibles. Intentando encontrar el correcto con instalments...`);
                            console.log(`🔍 DEBUG: issuerId recibido: "${issuerId}", tipo: ${typeof issuerId}`);
                            
                            // Intentar primero con el issuer_id proporcionado si está en la lista
                            if (issuerId && issuerId !== 'undefined' && issuerId !== 'null' && issuerId !== '') {
                                console.log(`🔍 DEBUG: Entrando al bloque de prueba del issuer proporcionado`);
                                console.log(`🔍 Buscando issuer proporcionado (${issuerId}) en la lista...`);
                                const providedIssuer = issuersResponse.data.find((iss: any) => iss.id.toString() === issuerId.toString());
                                if (providedIssuer) {
                                    console.log(`🔍 Probando primero con el issuer proporcionado: ${providedIssuer.id} (${providedIssuer.name})`);
                                    try {
                                        const testInstallmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${paymentMethodId}&bin=${bin}&issuer_id=${providedIssuer.id}`;
                                        console.log(`📡 Probando instalments con issuer ${providedIssuer.id}: ${testInstallmentsUrl}`);
                                        const testResponse = await axios.get(testInstallmentsUrl, {
                                            headers: {
                                                'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
                                            },
                                            timeout: 5000
                                        });
                                        
                                        console.log(`📦 Respuesta de instalments para issuer ${providedIssuer.id}:`, JSON.stringify(testResponse.data, null, 2));
                                        
                                        if (testResponse.data && testResponse.data.payer_costs && testResponse.data.payer_costs.length > 0) {
                                            paymentData.issuer_id = providedIssuer.id.toString();
                                            issuerIdObtained = true;
                                            console.log(`✅ Issuer ID encontrado (método 2b - issuer proporcionado funciona): ${providedIssuer.id} (${providedIssuer.name})`);
                                        } else {
                                            console.warn(`⚠️ El issuer proporcionado (${providedIssuer.id}) no devolvió payer_costs válidos.`);
                                        }
                                    } catch (testError: any) {
                                        console.warn(`⚠️ El issuer proporcionado (${providedIssuer.id}) no funciona con este BIN:`, testError?.response?.status, testError?.response?.data || testError.message);
                                    }
                                } else {
                                    console.warn(`⚠️ El issuer proporcionado (${issuerId}) no está en la lista de issuers válidos.`);
                                }
                            }
                            
                            // Si el proporcionado no funciona, probar con otros issuers
                            if (!issuerIdObtained) {
                                // Limitar a los primeros 20 para no hacer demasiadas requests
                                const issuersToTest = issuersResponse.data.slice(0, 20);
                                console.log(`🔄 Probando con ${issuersToTest.length} issuers diferentes (de ${issuersResponse.data.length} totales)...`);
                                
                                for (let i = 0; i < issuersToTest.length; i++) {
                                    const issuer = issuersToTest[i];
                                    
                                    // Saltar el que ya probamos
                                    if (issuerId && issuer.id.toString() === issuerId.toString()) {
                                        console.log(`⏭️ Saltando issuer ${issuer.id} (ya probado)`);
                                        continue;
                                    }
                                    
                                    console.log(`🔄 Probando issuer ${i + 1}/${issuersToTest.length}: ${issuer.id} (${issuer.name})`);
                                    
                                    try {
                                        const testInstallmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${paymentMethodId}&bin=${bin}&issuer_id=${issuer.id}`;
                                        const testResponse = await axios.get(testInstallmentsUrl, {
                                            headers: {
                                                'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
                                            },
                                            timeout: 5000
                                        });
                                        
                                        if (testResponse.data && testResponse.data.payer_costs && testResponse.data.payer_costs.length > 0) {
                                            // Este issuer funciona con este BIN
                                            paymentData.issuer_id = issuer.id.toString();
                                            issuerIdObtained = true;
                                            console.log(`✅ Issuer ID encontrado (método 2b - instalments test): ${issuer.id} (${issuer.name})`);
                                            break;
                                        } else {
                                            console.log(`❌ Issuer ${issuer.id} no devolvió payer_costs válidos`);
                                        }
                                    } catch (testError: any) {
                                        // Este issuer no funciona, continuar con el siguiente
                                        console.log(`❌ Issuer ${issuer.id} falló:`, testError?.response?.status || testError.message);
                                        continue;
                                    }
                                }
                                
                                if (!issuerIdObtained) {
                                    console.warn(`⚠️ No se encontró ningún issuer válido después de probar ${issuersToTest.length} issuers.`);
                                }
                            }
                        }
                    }
                } catch (issuersError: any) {
                    console.warn('⚠️ Error en método 2a (card_issuers sin BIN):', issuersError?.response?.status, issuersError?.response?.data || issuersError.message);
                }
            }
            
            // Método 3: Intentar con instalments que a veces incluye issuer_id
            if (!issuerIdObtained) {
                try {
                    const installmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?amount=${transactionAmount}&payment_method_id=${paymentMethodId}&bin=${bin}`;
                    console.log('📡 Llamando a (método 3 - instalments):', installmentsUrl);
                    const installmentsResponse = await axios.get(installmentsUrl, {
                        headers: {
                            'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
                        }
                    });
                    
                    console.log('📦 Respuesta de instalments:', JSON.stringify(installmentsResponse.data, null, 2));
                    
                    if (installmentsResponse.data && installmentsResponse.data.payer_costs && installmentsResponse.data.payer_costs.length > 0) {
                        const payerCost = installmentsResponse.data.payer_costs[0];
                        if (payerCost.issuer && payerCost.issuer.id) {
                            paymentData.issuer_id = payerCost.issuer.id.toString();
                            issuerIdObtained = true;
                            console.log('✅ Issuer ID obtenido del BIN (método 3 - instalments):', paymentData.issuer_id);
                        }
                    }
                } catch (installmentsError: any) {
                    console.warn('⚠️ Error en método 3 (instalments):', installmentsError?.response?.status, installmentsError?.response?.data || installmentsError.message);
                }
            }
            
            // Si no se pudo obtener del BIN, NO usar el proporcionado como fallback
            // El issuer_id proporcionado puede ser incorrecto y causar el error "not_result_by_params"
            if (!issuerIdObtained) {
                console.warn('⚠️ No se pudo obtener issuer_id del BIN con ningún método.');
                console.warn('⚠️ NO se usará el issuer_id proporcionado (' + issuerId + ') porque puede ser incorrecto para este BIN.');
                console.warn('⚠️ Se intentará crear el pago sin issuer_id. Mercado Pago intentará determinarlo automáticamente.');
                // NO establecer issuer_id - dejar que Mercado Pago lo determine
                // Esto puede fallar para tarjetas de débito bancarizadas, pero es mejor que usar un issuer_id incorrecto
            }
        } else if (issuerId && issuerId !== 'undefined' && issuerId !== 'null' && issuerId !== '') {
            // Si no hay BIN pero hay issuerId, usarlo con precaución
            // PERO NO para tarjetas prepagas (pueden quedar pendientes)
            const isPrepaidCardWithoutBin = cardType === 'prepaga';
            if (!isPrepaidCardWithoutBin) {
                console.warn('⚠️ Usando issuer_id proporcionado sin validación de BIN:', issuerId);
                paymentData.issuer_id = String(issuerId);
                console.log('✅ Usando issuer_id proporcionado (sin BIN disponible):', paymentData.issuer_id);
            } else {
                console.log('💡 Tarjeta prepaga sin BIN. NO se usará issuer_id para evitar que quede pendiente.');
                delete paymentData.issuer_id;
            }
        } else {
            console.warn('⚠️ No hay BIN ni issuerId proporcionado.');
        }
        
        // Si después de todos los intentos no tenemos issuer_id, verificar si hay selección manual
        // PERO solo usar el issuer_id manual si tenemos un payment_method_id válido
        // Y NO para tarjetas de débito ni prepagas (para evitar problemas)
        // Si no hay payment_method_id, no enviar issuer_id porque puede ser incorrecto
        const isDebitCardFinalCheck = paymentData.payment_method_id === 'debvisa' || paymentData.payment_method_id === 'debmaster';
        const isPrepaidCardFinalCheck = cardType === 'prepaga';
        
        if (!paymentData.issuer_id || paymentData.issuer_id === 'null') {
            if (hasManualSelection && paymentData.payment_method_id && !isDebitCardFinalCheck && !isPrepaidCardFinalCheck) {
                // Si el usuario seleccionó manualmente un issuer Y tenemos payment_method_id válido, usarlo
                // PERO NO para tarjetas de débito ni prepagas (para evitar problemas)
                // El usuario sabe mejor qué banco emitió su tarjeta
                console.log(`✅ Usando issuer_id seleccionado manualmente (no se pudo validar, pero confiamos en el usuario): ${issuerId}`);
                paymentData.issuer_id = String(issuerId);
                console.log('✅ issuer_id final que se enviará a Mercado Pago:', paymentData.issuer_id);
            } else if (hasManualSelection && paymentData.payment_method_id && (isDebitCardFinalCheck || isPrepaidCardFinalCheck)) {
                // Para tarjetas de débito y prepagas, NO usar issuer_id en absoluto
                if (isDebitCardFinalCheck) {
                    // Para tarjetas de débito, usar issuer_id manual SOLO si no se pudo obtener automáticamente
                    // Si ya tenemos uno automático (issuerIdObtained = true), no usar el manual
                    if (issuerIdObtained) {
                        console.log('💡 Para tarjetas de débito, ya tenemos issuer_id automático. NO se usará el manual.');
                        console.log('💡 Esto permite que Mercado Pago apruebe automáticamente sin pending_review_manual.');
                        // No hacer nada, mantener el issuer_id automático
                    } else {
                        console.log('⚠️ Para tarjetas de débito, no se pudo obtener issuer_id automático.');
                        console.log('⚠️ Usando issuer_id manual como último recurso (puede causar pending_review_manual).');
                        paymentData.issuer_id = String(issuerId);
                        console.log('✅ issuer_id final que se enviará a Mercado Pago:', paymentData.issuer_id);
                    }
                } else {
                    // Para tarjetas prepagas, NO usar issuer_id en absoluto
                    console.log('💡 Para tarjetas prepagas, NO se usará issuer_id (ni manual ni automático).');
                    console.log('💡 Las tarjetas prepagas no requieren issuer_id y puede causar que queden pendientes.');
                    delete paymentData.issuer_id;
                }
            } else if (hasManualSelection && !paymentData.payment_method_id) {
                // Si hay selección manual pero NO hay payment_method_id, no usar el issuer_id
                console.warn('⚠️ No se usará el issuer_id seleccionado manualmente porque no hay payment_method_id válido.');
                console.warn('⚠️ Mercado Pago determinará ambos automáticamente desde el token.');
                delete paymentData.issuer_id;
            } else {
                console.warn('⚠️ No se proporcionó issuer_id. El pago puede fallar para tarjetas de débito bancarizadas.');
                console.warn('⚠️ Datos disponibles:', { bin, issuerId, paymentMethodId, hasPaymentMethodId: !!paymentData.payment_method_id });
                // No establecer issuer_id - dejar que Mercado Pago lo determine
                delete paymentData.issuer_id;
            }
        } else {
            // Verificación final: si es tarjeta prepaga, eliminar issuer_id incluso si se estableció anteriormente
            if (cardType === 'prepaga' && paymentData.issuer_id) {
                console.log('💡 Verificación final: eliminando issuer_id para tarjeta prepaga.');
                delete paymentData.issuer_id;
                console.log('✅ issuer_id eliminado. Mercado Pago procesará el pago sin issuer_id.');
            } else {
                console.log('✅ issuer_id final que se enviará a Mercado Pago:', paymentData.issuer_id);
            }
        }
        
        console.log('📤 Payment data final (antes de enviar a MP):', {
            hasToken: !!paymentData.token,
            payment_method_id: paymentData.payment_method_id,
            issuer_id: paymentData.issuer_id || 'NO ENVIADO',
            transaction_amount: paymentData.transaction_amount
        });

        if (cardholderName) {
            const nameParts = cardholderName.trim().split(' ');
            paymentData.payer.first_name = nameParts[0] || cardholderName;
            paymentData.payer.last_name = nameParts.slice(1).join(' ') || '';
            if (paymentData.additional_info?.payer) {
                paymentData.additional_info.payer.first_name = paymentData.payer.first_name;
                paymentData.additional_info.payer.last_name = paymentData.payer.last_name;
            }
        }

        const paymentClient = new Payment(mpClient);
        let payment;

        // Preparar requestOptions fuera del try para que esté disponible en el catch
            const requestOptions: any = {
                idempotencyKey: `order-${orderId}-${Date.now()}`,
            };

            if (finalDeviceId) {
                requestOptions.customHeaders = {
                    'X-meli-session-id': finalDeviceId
                };
            }

        try {
            // Log final antes de enviar a Mercado Pago
            console.log('🚀 Enviando pago a Mercado Pago con:', {
                transaction_amount: paymentData.transaction_amount,
                payment_method_id: paymentData.payment_method_id,
                issuer_id: paymentData.issuer_id || 'NO ENVIADO',
                installments: paymentData.installments,
                hasToken: !!paymentData.token,
                tokenLength: paymentData.token?.length,
                tokenPrefix: paymentData.token?.substring(0, 10),
                bin: bin || 'NO PROPORCIONADO',
                hasPayer: !!paymentData.payer,
                hasAdditionalInfo: !!paymentData.additional_info
            });
            
            // Log completo del paymentData (sin el token completo por seguridad)
            console.log('📋 Payment data completo (sin token):', {
                ...paymentData,
                token: paymentData.token ? `${paymentData.token.substring(0, 10)}...` : 'NO TOKEN'
            });

            payment = await paymentClient.create({
                body: paymentData,
                requestOptions
            });

            console.log('✅ Payment ID:', payment.id);
            console.log('✅ Payment status:', payment.status);
            console.log('✅ Payment status_detail:', payment.status_detail);
            
            // Información sobre pending_review_manual
            if (payment.status_detail === 'pending_review_manual') {
                console.log('ℹ️  NOTA: El pago está en "pending_review_manual".');
                console.log('ℹ️  Esto es un estado NORMAL de Mercado Pago cuando su sistema de fraude/riesgo decide revisar el pago.');
                console.log('ℹ️  El pago puede ser aprobado automáticamente después de unos minutos u horas.');
                console.log('ℹ️  Factores que pueden causar pending_review_manual:');
                console.log('   - IP localhost (desarrollo)');
                console.log('   - Montos bajos o patrones inusuales');
                console.log('   - Configuración de la cuenta de Mercado Pago');
                console.log('   - Sistema de fraude/riesgo de Mercado Pago');
                console.log('ℹ️  El webhook notificará cuando el pago cambie de estado.');
            }
        } catch (error: any) {
            console.error('❌ Error MP:', error.message, 'Code:', error.code);
            console.error('❌ Error MP response:', JSON.stringify(error?.response?.data || error, null, 2));
            
            // Si el error es "not_result_by_params" y hay un issuer_id seleccionado manualmente,
            // intentar crear el pago sin issuer_id como último recurso
            const errorMessage = error?.response?.data?.message || error?.message || '';
            const isNotResultByParams = errorMessage.includes('not_result_by_params') || 
                                       error?.response?.data?.cause?.some((cause: any) => 
                                           cause?.description?.includes('not_result_by_params')
                                       );
            
            if (isNotResultByParams && hasManualSelection && paymentData.issuer_id) {
                console.warn(`⚠️ El issuer_id seleccionado manualmente (${paymentData.issuer_id}) no es válido para este BIN.`);
                console.warn(`⚠️ Intentando crear el pago sin issuer_id como último recurso...`);
                
                // Crear una copia del paymentData sin issuer_id
                const paymentDataWithoutIssuer = { ...paymentData };
                delete paymentDataWithoutIssuer.issuer_id;
                
                // Crear un nuevo idempotencyKey para el reintento
                const retryRequestOptions: any = {
                    idempotencyKey: `order-${orderId}-${Date.now()}-retry`,
                };

                if (finalDeviceId) {
                    retryRequestOptions.customHeaders = {
                        'X-meli-session-id': finalDeviceId
                    };
                }
                
                try {
                    console.log('🔄 Reintentando pago sin issuer_id...');
                    payment = await paymentClient.create({
                        body: paymentDataWithoutIssuer,
                        requestOptions: retryRequestOptions
                    });
                    
                    console.log('✅ Payment ID (sin issuer_id):', payment.id);
                    console.log('✅ Payment status:', payment.status);
                    console.log('✅ Payment status_detail:', payment.status_detail);
                } catch (retryError: any) {
                    console.error('❌ Error MP (reintento sin issuer_id):', retryError.message);
                    console.error('❌ Error MP response (reintento):', JSON.stringify(retryError?.response?.data || retryError, null, 2));
                    throw retryError;
                }
            } else {
            throw error;
            }
        }

        const status = payment.status || 'pending';
        const statusDetail = payment.status_detail;

        await firestore.collection('orders').doc(orderId).update({
            status: status === 'approved' ? 'paid' : status,
            paymentId: payment.id,
            paymentStatus: status,
            paymentDetails: {
                status_detail: statusDetail,
                payment_method_id: payment.payment_method_id,
                payment_type_id: payment.payment_type_id,
            },
            updatedAt: new Date()
        });

        if (status === 'approved') {
            // Asignar productos al usuario (incluye crear inscripciones para eventos)
            try {
                await assignProductsToUser(
                    metadata.userId, 
                    items, 
                    payment.id?.toString(), 
                    status
                );
                console.log(`✅ Productos asignados al usuario ${metadata.userId} después de pago aprobado`);
            } catch (assignError) {
                console.error('❌ Error al asignar productos después de pago aprobado:', assignError);
                // No fallar la respuesta, pero registrar el error
            }

            await sendPaymentConfirmationEmail(metadata.userId, orderNumber, items);

            return res.json({
                success: true,
                message: "Pago aprobado exitosamente",
                orderId,
                orderNumber,
                paymentId: payment.id,
                status,
                statusDetail
            });
        }

        if (status === 'rejected') {
            return res.status(400).json({
                success: false,
                message: "Pago rechazado",
                orderId,
                orderNumber,
                paymentId: payment.id,
                status,
                statusDetail,
                errorMessage: getPaymentErrorMessage(statusDetail || 'cc_rejected_other_reason')
            });
        }

        return res.json({
            success: true,
            message: "Pago en proceso",
            orderId,
            orderNumber,
            paymentId: payment.id,
            status,
            statusDetail
        });
    } catch (err: any) {
        console.error('createPayment error:', err?.response?.data || err);
        console.error('Full error details:', JSON.stringify(err, null, 2));

        if (err?.response?.data) {
            const mpError = err.response.data;
            const errorMessage = mpError.message || mpError.error || '';
            const errorDetails = err?.message || '';
            
            // Detectar específicamente el error "Card Token not found"
            if (errorMessage.includes('Card Token not found') || 
                errorMessage.includes('card_token') ||
                errorDetails.includes('Card Token not found') ||
                errorDetails.includes('card_token') ||
                mpError.cause?.some((cause: any) => cause?.description?.includes('card_token') || cause?.description?.includes('Card Token'))) {
            return res.status(400).json({
                success: false,
                error: "Error al procesar el pago con Mercado Pago",
                    message: "El token de la tarjeta no es válido o expiró. Por favor, ingresa los datos de la tarjeta nuevamente.",
                    mpError: errorMessage,
                cause: mpError.cause,
                    details: "Card Token not found"
                });
            }
            
            // Detectar específicamente el error "not_result_by_params"
            // Este error ocurre cuando falta el issuer_id para tarjetas de débito bancarizadas
            if (errorMessage.includes('not_result_by_params') || 
                errorDetails.includes('not_result_by_params') ||
                mpError.cause?.some((cause: any) => cause?.description?.includes('not_result_by_params'))) {
                return res.status(400).json({
                    success: false,
                    error: "Error al procesar el pago con Mercado Pago",
                    message: "No se pudo identificar el banco emisor de la tarjeta. Por favor, verifica los datos de tu tarjeta de débito bancarizada e intenta nuevamente.",
                    mpError: errorMessage,
                    cause: mpError.cause,
                    details: "not_result_by_params"
                });
            }
            
            return res.status(400).json({
                success: false,
                error: "Error al procesar el pago con Mercado Pago",
                mpError: errorMessage,
                cause: mpError.cause,
                details: errorDetails
            });
        }

        // Verificar si el error está en el mensaje general
        const errorMessage = err?.message || '';
        
        if (errorMessage.includes('Card Token not found') || errorMessage.includes('card_token')) {
            return res.status(400).json({
                success: false,
                error: "Error al crear el pago",
                message: "El token de la tarjeta no es válido o expiró. Por favor, ingresa los datos de la tarjeta nuevamente.",
                details: "Card Token not found"
            });
        }
        
        if (errorMessage.includes('not_result_by_params')) {
            return res.status(400).json({
                success: false,
                error: "Error al crear el pago",
                message: "No se pudo identificar el banco emisor de la tarjeta. Por favor, verifica los datos de tu tarjeta de débito bancarizada e intenta nuevamente.",
                details: "not_result_by_params"
            });
        }

        return res.status(500).json({
            success: false,
            error: "Error al crear el pago",
            details: errorMessage
        });
    }
};

export const handleWebhook = async (req: Request, res: Response) => {
    try {
        console.log('🔔 Webhook recibido de Mercado Pago');
        console.log('Headers:', req.headers);
        console.log('Body:', JSON.stringify(req.body, null, 2));

        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;

        // Validar firma del webhook para seguridad
        if (!validateWebhookSignature(req.body, xSignature, xRequestId)) {
            console.warn('⚠️  Firma de webhook inválida - posible intento de fraude');
            return res.sendStatus(401);
        }

        console.log('✅ Firma de webhook válida');

        // Extraer información del webhook
        const { type, data } = req.body;

        // Solo procesar notificaciones de pagos
        if (type === 'payment') {
            const paymentId = data.id;
            console.log(`📦 Procesando notificación de pago: ${paymentId}`);

            // Obtener información completa del pago desde MP
            const paymentClient = new Payment(mpClient);
            const payment = await paymentClient.get({ id: paymentId });

            console.log(`💳 Pago ${paymentId} - Status: ${payment.status}`);

            // Buscar la orden asociada a este pago
            const ordersSnapshot = await firestore
                .collection('orders')
                .where('paymentId', '==', paymentId)
                .limit(1)
                .get();

            if (ordersSnapshot.empty) {
                console.warn(`⚠️  No se encontró orden para el pago ${paymentId}`);
                return res.sendStatus(200); // Responder OK para que MP no reintente
            }

            const orderDoc = ordersSnapshot.docs[0];
            const orderId = orderDoc.id;
            const orderData = orderDoc.data();

            console.log(`📋 Orden encontrada: ${orderId}`);

            // Actualizar estado de la orden según el pago
            const newStatus = payment.status === 'approved' ? 'paid' : payment.status || 'pending';

            await firestore.collection('orders').doc(orderId).update({
                status: newStatus,
                paymentStatus: payment.status,
                paymentDetails: {
                    status_detail: payment.status_detail,
                    payment_method_id: payment.payment_method_id,
                    payment_type_id: payment.payment_type_id,
                },
                updatedAt: new Date(),
                webhookProcessedAt: new Date()
            });

            // Si el pago fue aprobado, asignar productos al usuario
            if (payment.status === 'approved') {
                console.log(`🎁 Asignando productos al usuario ${orderData.userId}`);
                await assignProductsToUser(
                    orderData.userId, 
                    orderData.items, 
                    payment.id?.toString(), 
                    payment.status
                );

                // Enviar email de confirmación
                try {
                    await sendPaymentConfirmationEmail(orderData.userId, orderId, orderData);
                    console.log(`📧 Email de confirmación enviado a ${orderData.userId}`);
                } catch (emailError) {
                    console.error('Error enviando email:', emailError);
                }
            }

            return res.sendStatus(200);
        }

        // Responder OK para otros tipos de notificaciones
        return res.sendStatus(200);

    } catch (err) {
        console.error('❌ handleWebhook error:', err);
        return res.sendStatus(500);
    }
};

const validateWebhookSignature = (body: any, signature: string, requestId: string): boolean => {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';

    const parts = signature.split(',');
    let ts = '';
    let hash = '';

    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key.trim() === 'ts') ts = value;
        if (key.trim() === 'v1') hash = value;
    });

    const manifest = `id:${body.data.id};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    return calculatedHash === hash;
};

const calculateTotalPrice = async (items: any[]): Promise<number> => {
    let totalPrice = 0;
    for (const item of items) {
        let price = Number(item.precio || item.price || 0);

        if (isNaN(price) || price <= 0) {
            const productId = item.id || item.productId;
            if (!productId) {
                console.warn(`Item sin ID, no se puede obtener precio:`, item);
                continue;
            }

            let productDoc = await firestore.collection('courses').doc(productId).get();
            if (productDoc.exists) {
                const data = productDoc.data();
                price = Number(data?.precio || data?.price || 0);
            } else {
                // Buscar en events
                productDoc = await firestore.collection('events').doc(productId).get();
                if (productDoc.exists) {
                    const data = productDoc.data();
                    price = Number(data?.precio || data?.price || 0);
                } else {
                    // Buscar en ebooks
                    productDoc = await firestore.collection('ebooks').doc(productId).get();
                    if (productDoc.exists) {
                        const data = productDoc.data();
                        price = Number(data?.precio || data?.price || 0);
                    }
                }
            }
        }

        if (isNaN(price) || price <= 0) {
            console.warn(`No se pudo determinar precio válido para item:`, item);
            continue;
        }

        totalPrice += price;
    }
    return totalPrice;
};

const validateProds = async (items: any[]): Promise<boolean> => {
    for (const item of items) {
        const prod = await firestore.collection('courses').doc(item.id).get();
        if (prod.exists) {
            continue;
        }

        const course = await firestore.collection('events').doc(item.id).get();
        if (course.exists) {
            continue;
        }

        const ebook = await firestore.collection('ebooks').doc(item.id).get();
        if (ebook.exists) {
            continue;
        }

        return false;
    }
    return true;
};

const assignProductsToUser = async (
    userId: string, 
    items: any[], 
    paymentId?: string, 
    paymentStatus?: string
): Promise<void> => {
    try {
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.error(`Usuario ${userId} no encontrado`);
            return;
        }

        const userData = userDoc.data();
        // Inicializar arrays vacíos si no existen
        const cursosAsignados = Array.isArray(userData?.cursos_asignados) ? userData.cursos_asignados : [];
        const eventosAsignados = Array.isArray(userData?.eventos_asignados) ? userData.eventos_asignados : [];
        const ebooksAsignados = Array.isArray(userData?.ebooks_asignados) ? userData.ebooks_asignados : [];
        const inscripcionesCollection = firestore.collection('inscripciones_eventos');
        
        console.log(`📊 [USER DATA] Estado inicial del usuario:`, {
            tieneCursosAsignados: cursosAsignados.length > 0,
            tieneEventosAsignados: eventosAsignados.length > 0,
            tieneEbooksAsignados: ebooksAsignados.length > 0,
            cursosCount: cursosAsignados.length,
            eventosCount: eventosAsignados.length,
            ebooksCount: ebooksAsignados.length
        });

        for (const item of items) {
            const productId = item.id || item.productId;
            const precio = Number(item.precio || item.price || item.unit_price || 0);
            
            console.log(`🔍 [ITEM] Procesando item:`, {
                productId: productId || 'NO ID',
                precio: precio || 0,
                itemCompleto: JSON.stringify(item, null, 2)
            });
            
            if (!productId) {
                console.error(`❌ [ITEM] Item sin ID válido:`, item);
                continue; // Saltar este item si no tiene ID
            }

            // Verificar en qué colección está el producto
            const courseDoc = await firestore.collection('courses').doc(productId).get();
            if (courseDoc.exists && !cursosAsignados.includes(productId)) {
                cursosAsignados.push(productId);
                continue;
            }

            const eventDoc = await firestore.collection('events').doc(productId).get();
            if (eventDoc.exists) {
                console.log(`🎯 [EVENTO DETECTADO] Evento ${productId} encontrado para usuario ${userId} - precio: ${precio}`);
                
                // Agregar evento a eventos_asignados si no está ya incluido
                if (!eventosAsignados.includes(productId)) {
                    eventosAsignados.push(productId);
                    console.log(`✅ [EVENTO] Evento agregado a eventos_asignados`);
                }
                
                // CREAR INSCRIPCIÓN SIEMPRE después de un pago exitoso
                // No verificar si existe, simplemente crear (Firestore permite múltiples documentos)
                console.log(`📝 [INSCRIPCIÓN] === INICIANDO CREACIÓN DE INSCRIPCIÓN ===`);
                console.log(`📝 [INSCRIPCIÓN] Evento: ${productId}`);
                console.log(`📝 [INSCRIPCIÓN] Usuario: ${userId}`);
                console.log(`📝 [INSCRIPCIÓN] PaymentId: ${paymentId || 'N/A'}`);
                console.log(`📝 [INSCRIPCIÓN] PaymentStatus: ${paymentStatus || 'N/A'}`);
                
                // Datos de la inscripción
                const nuevaInscripcion: any = {
                    userId: userId,
                    eventoId: productId,
                    fechaInscripcion: new Date(),
                    estado: 'activa',
                    metodoPago: 'pago',
                    precioPagado: precio || 0,
                };
                
                if (paymentId) {
                    nuevaInscripcion.paymentId = paymentId;
                }
                
                if (paymentStatus) {
                    nuevaInscripcion.paymentStatus = paymentStatus;
                }

                console.log(`📋 [INSCRIPCIÓN] Datos completos:`, JSON.stringify(nuevaInscripcion, null, 2));

                // CREAR EN inscripciones_eventos
                try {
                    console.log(`🔄 [INSCRIPCIÓN] Creando en inscripciones_eventos...`);
                    const inscripcionRef = await inscripcionesCollection.add(nuevaInscripcion);
                    console.log(`✅✅✅ [INSCRIPCIÓN] EXITOSO en inscripciones_eventos - ID: ${inscripcionRef.id}`);
                } catch (error: any) {
                    console.error(`❌❌❌ [INSCRIPCIÓN] FALLO en inscripciones_eventos:`, {
                        message: error?.message,
                        code: error?.code,
                        name: error?.name,
                        stack: error?.stack
                    });
                }

                console.log(`✅ [INSCRIPCIÓN] === PROCESO COMPLETADO ===`);
                continue;
            }

            const ebookDoc = await firestore.collection('ebooks').doc(productId).get();
            if (ebookDoc.exists && !ebooksAsignados.includes(productId)) {
                ebooksAsignados.push(productId);
            }
        }

        // Actualizar el usuario con los nuevos productos asignados
        // Asegurarse de que siempre sean arrays, incluso si estaban vacíos
        const updateData: any = {
            cursos_asignados: Array.isArray(cursosAsignados) ? cursosAsignados : [],
            eventos_asignados: Array.isArray(eventosAsignados) ? eventosAsignados : [],
            ebooks_asignados: Array.isArray(ebooksAsignados) ? ebooksAsignados : [],
            updatedAt: new Date()
        };
        
        console.log(`💾 [UPDATE USER] Actualizando usuario ${userId} con:`, {
            cursos: updateData.cursos_asignados.length,
            eventos: updateData.eventos_asignados.length,
            ebooks: updateData.ebooks_asignados.length
        });
        
        await userRef.update(updateData);
        console.log(`✅ [UPDATE USER] Usuario actualizado exitosamente`);

        console.log(`Productos asignados al usuario ${userId}:`, {
            cursos: cursosAsignados.length,
            eventos: eventosAsignados.length,
            ebooks: ebooksAsignados.length
        });
    } catch (error) {
        console.error('Error al asignar productos al usuario:', error);
        throw error; // Re-lanzar para que el webhook pueda manejarlo
    }
};

const sendPaymentConfirmationEmail = async (userId: string, orderId: string, orderData: any) => {
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            console.error('Usuario no encontrado para enviar email');
            return;
        }

        const user = userDoc.data();
        const userEmail = user?.email;
        const userName = user?.nombre || 'Cliente';

        if (!userEmail) {
            console.error('Email de usuario no disponible');
            return;
        }

        // Construir lista de productos
        const itemsList = orderData.map((item: any) =>
            `<li>${item.nombre || item.title} - $${item.precio || item.price || item.unit_price}</li>`
        ).join('');

        let total = orderData.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);

        const emailMessage = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00a650;">¡Pago Confirmado!</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                <p>Tu pago ha sido procesado exitosamente.</p>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Detalles de tu compra:</h3>
                    <p><strong>Número de Orden:</strong> ${orderData.orderNumber || orderId}</p>
                    <p><strong>Estado:</strong> Pagado ✅</p>
                    <p><strong>Total:</strong> $${total}</p>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
                </div>

                <h3>Productos adquiridos:</h3>
                <ul>${itemsList}</ul>

                <p>Ya puedes acceder a tus productos en tu cuenta de INEE.</p>
                
                <p style="margin-top: 30px;">Gracias por tu compra,<br><strong>Equipo INEE</strong></p>
            </div>
        `;

        await resend.emails.send({
            from: "INEE Oficial <contacto@ineeoficial.com>",
            to: userEmail,
            subject: `✅ Confirmación de Pago - Orden ${orderData.orderNumber || orderId}`,
            html: emailMessage
        });

        console.log(`✅ Email de confirmación enviado a ${userEmail}`);
    } catch (error) {
        console.error('Error enviando email de confirmación:', error);
        throw error;
    }
};

const getPaymentErrorMessage = (statusDetail: string): string => {
    const errorMessages: { [key: string]: string } = {
        'cc_rejected_bad_filled_card_number': 'Número de tarjeta inválido',
        'cc_rejected_bad_filled_date': 'Fecha de vencimiento inválida',
        'cc_rejected_bad_filled_other': 'Revisa los datos de tu tarjeta',
        'cc_rejected_bad_filled_security_code': 'Código de seguridad inválido',
        'cc_rejected_blacklist': 'No pudimos procesar tu pago',
        'cc_rejected_call_for_authorize': 'Debes autorizar el pago con tu banco',
        'cc_rejected_card_disabled': 'Tarjeta deshabilitada. Contacta a tu banco',
        'cc_rejected_card_error': 'No pudimos procesar tu tarjeta',
        'cc_rejected_duplicated_payment': 'Ya procesaste un pago similar recientemente',
        'cc_rejected_high_risk': 'Tu pago fue rechazado. Elige otro medio de pago',
        'cc_rejected_insufficient_amount': 'Saldo insuficiente en tu tarjeta',
        'cc_rejected_invalid_installments': 'La tarjeta no acepta el número de cuotas seleccionado',
        'cc_rejected_max_attempts': 'Has alcanzado el límite de intentos. Elige otra tarjeta',
        'cc_rejected_other_reason': 'Tu banco rechazó el pago. Intenta con otra tarjeta o contacta a tu banco',
        'cc_rejected_by_bank': 'Tu banco rechazó la transacción. Contacta a tu banco',
        'cc_rejected_3ds_mandatory': 'Tu tarjeta requiere autenticación 3DS',
        'cc_rejected_3ds_challenge': 'Fallo en la autenticación 3DS',
    };

    return errorMessages[statusDetail] || 'El pago no pudo ser procesado. Intenta con otro medio de pago';
};
