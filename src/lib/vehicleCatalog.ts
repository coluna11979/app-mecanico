/**
 * Marcas e modelos mais comuns nas oficinas do Brasil, para escolher em vez de digitar.
 * Lista local de propósito (funciona sem internet e sem depender de serviço externo).
 * O que não estiver aqui se digita pela opção "Outro".
 */
export const VEHICLE_CATALOG: Record<string, string[]> = {
  'Chevrolet': ['Onix', 'Onix Plus', 'Prisma', 'Celta', 'Corsa', 'Classic', 'Agile', 'Montana', 'S10', 'Spin', 'Tracker', 'Cruze', 'Cruze Sport6', 'Cobalt', 'Equinox', 'Trailblazer', 'Meriva', 'Vectra', 'Astra', 'Zafira', 'Captiva', 'Camaro', 'Joy', 'Sonic', 'Blazer', 'Silverado', 'D-20', 'Opala', 'Kadett', 'Monza'],
  'Volkswagen': ['Gol', 'Voyage', 'Saveiro', 'Fox', 'CrossFox', 'Polo', 'Virtus', 'Up!', 'Golf', 'Jetta', 'Passat', 'T-Cross', 'Nivus', 'Taos', 'Tiguan', 'Amarok', 'Parati', 'Santana', 'Kombi', 'Fusca', 'SpaceFox', 'Bora', 'Touareg', 'Delivery', 'Constellation'],
  'Fiat': ['Uno', 'Palio', 'Palio Weekend', 'Siena', 'Grand Siena', 'Strada', 'Toro', 'Mobi', 'Argo', 'Cronos', 'Pulse', 'Fastback', 'Fiorino', 'Doblò', 'Ducato', 'Idea', 'Punto', 'Linea', 'Bravo', 'Stilo', 'Marea', 'Tempra', 'Tipo', 'Elba', '500', 'Freemont', 'Scudo'],
  'Ford': ['Ka', 'Ka Sedan', 'Fiesta', 'Fiesta Sedan', 'Focus', 'Fusion', 'EcoSport', 'Ranger', 'Courier', 'Escort', 'Edge', 'Territory', 'Maverick', 'Mustang', 'Bronco', 'F-250', 'F-1000', 'Transit', 'Corcel', 'Belina', 'Del Rey', 'Verona', 'Cargo'],
  'Toyota': ['Corolla', 'Corolla Cross', 'Etios', 'Etios Sedan', 'Yaris', 'Hilux', 'SW4', 'RAV4', 'Camry', 'Prius', 'Fielder', 'Bandeirante', 'Land Cruiser'],
  'Honda': ['Civic', 'City', 'Fit', 'HR-V', 'WR-V', 'CR-V', 'Accord', 'Civic Si', 'ZR-V', 'Elysion'],
  'Hyundai': ['HB20', 'HB20S', 'HB20X', 'Creta', 'Tucson', 'ix35', 'Santa Fe', 'Azera', 'Elantra', 'i30', 'Veloster', 'HR', 'Sonata', 'Kona', 'Atos'],
  'Renault': ['Sandero', 'Sandero Stepway', 'Logan', 'Duster', 'Duster Oroch', 'Oroch', 'Kwid', 'Captur', 'Clio', 'Megane', 'Scénic', 'Symbol', 'Fluence', 'Master', 'Kangoo', 'Twingo', 'Stepway'],
  'Nissan': ['March', 'Versa', 'Kicks', 'Sentra', 'Frontier', 'Livina', 'Tiida', 'X-Trail', 'Leaf', 'Grand Livina', 'Altima'],
  'Jeep': ['Renegade', 'Compass', 'Commander', 'Cherokee', 'Grand Cherokee', 'Wrangler', 'Gladiator'],
  'Peugeot': ['206', '207', '208', '307', '308', '408', '2008', '3008', '5008', '106', '404', 'Partner', 'Expert', 'Boxer', 'Hoggar'],
  'Citroën': ['C3', 'C3 Aircross', 'C4 Cactus', 'C4 Lounge', 'C4 Pallas', 'C4', 'Aircross', 'Xsara Picasso', 'Berlingo', 'Jumper', 'C5', 'Basalt'],
  'Mitsubishi': ['L200 Triton', 'Pajero', 'Pajero Sport', 'Pajero TR4', 'ASX', 'Outlander', 'Lancer', 'Eclipse Cross'],
  'Kia': ['Sportage', 'Sorento', 'Picanto', 'Cerato', 'Soul', 'Stonic', 'Carnival', 'Bongo', 'Niro', 'Seltos', 'Optima', 'Mohave'],
  'BMW': ['Série 1', 'Série 3', 'Série 5', 'X1', 'X3', 'X5', 'X6', '320i', '118i', 'Z4', 'M3', 'iX3'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'Classe E', 'GLA', 'GLC', 'CLA', 'Sprinter', 'Accelo', 'Actros', 'Atego', 'ML', 'Vito'],
  'Audi': ['A3', 'A4', 'A5', 'Q3', 'Q5', 'Q7', 'A1', 'TT', 'A6'],
  'Volvo': ['XC60', 'XC90', 'XC40', 'S60', 'V40', 'S40', 'FH', 'VM'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
  'Suzuki': ['Jimny', 'Vitara', 'Grand Vitara', 'Swift', 'S-Cross', 'SX4'],
  'Caoa Chery': ['Tiggo 2', 'Tiggo 3x', 'Tiggo 5x', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6', 'QQ', 'Celer', 'Face', 'iCar'],
  'JAC': ['J3', 'J5', 'J6', 'T40', 'T50', 'T60', 'T8', 'iEV20'],
  'Ram': ['1500', '2500', '3500', 'Rampage'],
  'BYD': ['Dolphin', 'Dolphin Mini', 'Song Plus', 'Seal', 'Yuan Plus', 'Tan', 'Han'],
  'GWM': ['Haval H6', 'Ora 03', 'Poer'],
  'Subaru': ['Impreza', 'Forester', 'XV', 'Outback', 'Legacy', 'WRX'],
  'Lexus': ['NX', 'RX', 'UX', 'IS', 'ES'],
  'Porsche': ['Cayenne', 'Macan', '911', 'Panamera', 'Boxster', 'Cayman', 'Taycan'],
  'Mini': ['Cooper', 'Countryman', 'Clubman', 'One'],
  'Chrysler': ['PT Cruiser', '300C', 'Town & Country', 'Neon'],
  'Dodge': ['Journey', 'Ram', 'Dakota', 'Charger', 'Challenger'],
  'Troller': ['T4'],
  'Effa/Lifan': ['Lifan X60', 'Lifan 530', 'Lifan 320', 'Lifan 620'],
};

export const VEHICLE_MAKES = Object.keys(VEHICLE_CATALOG).sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Anos do mais novo para o mais antigo (próximo ano incluído: modelo novo sai antes) */
export function vehicleYears(from = 1970): number[] {
  const top = new Date().getFullYear() + 1;
  return Array.from({ length: top - from + 1 }, (_, i) => top - i);
}
