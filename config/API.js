/**
 * @file space_data_hub.js
 * @description Módulo de serviço completo para buscar e analisar dados de clima espacial da API DONKI da NASA.
 * @version 2.2.0
 * @author Pure Flow
 * * Esta versão implementa um sistema de análise híbrido: prioriza os modelos de alta precisão da NASA
 * * e utiliza uma estimativa analítica baseada em distância/velocidade como fallback.
 */

export const SpaceDataHub = {
    /**
     * SUA CHAVE DE API DA NASA.
     * Integrada conforme solicitado.
     */
    apiKey: '7GcXfHCbgKecnJw1e7FkyWuUAZu54s23CT8HPUXL',

    /**
     * Função auxiliar interna para realizar as chamadas à API.
     */
    async _fetchDonkiData(endpoint, params = {}) {
        const startDate = params.startDate || new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = params.endDate || new Date().toISOString().split('T')[0];
        
        const queryParams = new URLSearchParams({ startDate, endDate, api_key: this.apiKey, ...params });
        const apiUrl = `https://api.nasa.gov/DONKI/${endpoint}?${queryParams.toString()}`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error(`Erro de rede para o endpoint ${endpoint}: ${response.statusText}`);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error(`Falha ao buscar dados do endpoint ${endpoint}:`, error);
            return null;
        }
    },

    // --- FUNÇÕES DE BUSCA DE EVENTOS ESPECÍFICOS ---
    getCoronalMassEjections: function(params) { return this._fetchDonkiData('CME', params); },
    getGeomagneticStorms: function(params) { return this._fetchDonkiData('GST', params); },
    getSolarFlares: function(params) { return this._fetchDonkiData('FLR', params); },
    getSolarEnergeticParticles: function(params) { return this._fetchDonkiData('SEP', { ...params, mostAccurateOnly: true }); },
    getHighSpeedStreams: function(params) { return this._fetchDonkiData('HSS', params); },

    // --- FUNÇÃO DE ANÁLISE HÍBRIDA (ALTA PRECISÃO + ANALÍTICA) ---
    /**
     * Busca e analisa os dados de CME para determinar o risco de impacto MAIS IMINENTE em 'Moon' ou 'Mars'.
     * @param {string} targetPlanet - 'Moon' ou 'Mars'.
     * @returns {Promise<object>} Objeto de análise de impacto.
     */
    async getImpactAnalysis(targetPlanet) {
        const analysisData = await this._fetchDonkiData('CMEAnalysis', { mostAccurateOnly: true });
        
        if (!analysisData) {
            return { isImpact: false, summary: "Erro ao conectar com os modelos de previsão da NASA." };
        }
        if (analysisData.length === 0) {
            return { isImpact: false, summary: "Nenhum evento solar significativo analisado recentemente." };
        }

        let earliestImpact = null;

        // MODO 1: Busca pela análise de alta precisão do modelo da NASA
        for (const event of analysisData) {
            if (event.cmeAnalyses && event.cmeAnalyses[0]?.impacts) {
                for (const impact of event.cmeAnalyses[0].impacts) {
                    const impactLocation = (targetPlanet === 'Moon') ? 'L1' : 'Mars';
                    if (impact.location === impactLocation && impact.isGltf) {
                        const arrivalTime = new Date(impact.estimatedTimeOfArrival);
                        const timeToImpactMs = arrivalTime.getTime() - new Date().getTime();
                        if (timeToImpactMs > 0 && (earliestImpact === null || arrivalTime < earliestImpact.arrivalTime)) {
                            const timeToImpactHours = Math.round(timeToImpactMs / (1000 * 60 * 60));
                            earliestImpact = {
                                isImpact: true,
                                analysisType: 'NASA_MODEL', // Informa que usamos o modelo de alta precisão
                                arrivalTime, timeToImpactHours,
                                summary: `ALERTA (Modelo NASA): Impacto previsto para ${targetPlanet} em ${timeToImpactHours} horas.`,
                                speed: event.cmeAnalyses[0].speed,
                                simulationLink: event.link,
                                eventData: event
                            };
                        }
                    }
                }
            }
        }

        if (earliestImpact) {
            console.log(`AMEAÇA MAIS IMINENTE (MODELO NASA) DETECTADA para ${targetPlanet}:`, earliestImpact);
            return earliestImpact;
        }

        // MODO 2: Fallback para estimativa analítica se nenhum modelo de impacto foi encontrado
        console.log(`Nenhum impacto modelado encontrado. Tentando análise analítica para ${targetPlanet}...`);
        for (const event of analysisData) {
            const analysis = event.cmeAnalyses ? event.cmeAnalyses[0] : null;
            const note = event.note ? event.note.toLowerCase() : '';

            // Ameaça potencial: CME do tipo "halo" que ainda não foi modelado.
            if (analysis && analysis.speed && note.includes('halo cme')) {
                const speedKms = analysis.speed;
                const distanceKm = (targetPlanet === 'Moon') ? 150000000 : 225000000; // Distâncias médias

                const travelTimeSeconds = distanceKm / speedKms;
                const arrivalTime = new Date(new Date(event.startTime).getTime() + travelTimeSeconds * 1000);
                const timeToImpactMs = arrivalTime.getTime() - new Date().getTime();

                if (timeToImpactMs > 0 && (earliestImpact === null || arrivalTime < earliestImpact.arrivalTime)) {
                    const timeToImpactHours = Math.round(timeToImpactMs / (1000 * 60 * 60));
                    earliestImpact = {
                        isImpact: true,
                        analysisType: 'ANALYTICAL_ESTIMATE', // Informa que usamos nossa estimativa
                        arrivalTime, timeToImpactHours,
                        summary: `ALERTA (Estimativa Analítica): Possível impacto de Halo CME em ${targetPlanet} em ~${timeToImpactHours} horas.`,
                        speed: speedKms,
                        simulationLink: event.link,
                        eventData: event
                    };
                }
            }
        }

        if (earliestImpact) {
            console.log(`AMEAÇA MAIS IMINENTE (ESTIMATIVA ANALÍTICA) DETECTADA para ${targetPlanet}:`, earliestImpact);
            return earliestImpact;
        }

        return { isImpact: false, summary: "Nenhum impacto previsto para o seu alvo." };
    },

    // --- FUNÇÃO MESTRA PARA BUSCAR TUDO ---
    async getAllEvents() {
        console.log("Buscando todos os dados de eventos de clima espacial...");
        const [coronalMassEjections, geomagneticStorms, solarFlares, solarEnergeticParticles, highSpeedStreams] = await Promise.all([
            this.getCoronalMassEjections(), this.getGeomagneticStorms(), this.getSolarFlares(),
            this.getSolarEnergeticParticles(), this.getHighSpeedStreams()
        ]);
        return { coronalMassEjections, geomagneticStorms, solarFlares, solarEnergeticParticles, highSpeedStreams };
    }
};
