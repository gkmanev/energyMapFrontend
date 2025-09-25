// services/energyDataService.js
import axios from 'axios'

class EnergyDataService {
  constructor() {
    this.apiKeys = {
      electricityMaps: process.env.VUE_APP_ELECTRICITY_MAPS_API_KEY,
      wattTime: process.env.VUE_APP_WATTTIME_API_KEY
    }
  }

  async getCarbonIntensity(countryCode, datetime = null) {
    try {
      // Try ElectricityMaps first
      if (this.apiKeys.electricityMaps) {
        return await this.getElectricityMapsData(countryCode, datetime)
      }
      
      // Fallback to WattTime
      if (this.apiKeys.wattTime) {
        return await this.getWattTimeData(countryCode, datetime)
      }
      
      // Use mock data for development
      return this.getMockData(countryCode)
      
    } catch (error) {
      console.error('Error fetching energy data:', error)
      return this.getMockData(countryCode)
    }
  }

  async getElectricityMapsData(zone, datetime) {
    const endpoint = datetime 
      ? `/v3/carbon-intensity/history`
      : `/v3/carbon-intensity/latest`
    
    const params = { zone }
    if (datetime) params.datetime = datetime.toISOString()

    const response = await axios.get(`https://api.electricitymaps.com${endpoint}`, {
      params,
      headers: {
        'auth-token': this.apiKeys.electricityMaps
      }
    })

    return {
      carbonIntensity: response.data.carbonIntensity,
      renewable: response.data.renewablePercentage || 0,
      timestamp: response.data.datetime
    }
  }

  getMockData(countryCode) {
    const mockData = {
      'DE': { carbonIntensity: 420, renewable: 45 },
      'FR': { carbonIntensity: 85, renewable: 75 },
      'BG': { carbonIntensity: 480, renewable: 22 },
      'NO': { carbonIntensity: 25, renewable: 95 },
      'PL': { carbonIntensity: 650, renewable: 15 }
    }
    
    return mockData[countryCode] || { carbonIntensity: 300, renewable: 30 }
  }
}

export default new EnergyDataService()
