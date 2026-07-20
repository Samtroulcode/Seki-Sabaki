import {defaultMatchmakingOptions} from '../../modules/ogsmatchmakingoptions.js'

export const boardSizes = [9, 13, 19]
export const speeds = ['blitz', 'rapid', 'live', 'correspondence']
export const timeSystems = ['byoyomi', 'fischer']
export const conditions = ['required', 'preferred', 'no-preference']
export const rules = ['japanese', 'chinese', 'aga', 'korean', 'ing', 'nz']
export const handicapValues = ['enabled', 'disabled']

export {defaultMatchmakingOptions}

export function createOgsPanelLabels(t) {
  return {
    conditions: {
      required: t('Required'),
      preferred: t('Preferred'),
      'no-preference': t('No preference'),
    },
    speeds: {
      blitz: t('Blitz'),
      rapid: t('Rapid'),
      live: t('Live'),
      correspondence: t('Correspondence'),
    },
    timeSystems: {
      byoyomi: t('Byo-yomi'),
      fischer: t('Fischer'),
    },
    rules: {
      japanese: t('Japanese'),
      chinese: t('Chinese'),
      aga: t('AGA'),
      korean: t('Korean'),
      ing: t('Ing'),
      nz: t('New Zealand'),
    },
    handicap: {
      enabled: t('Enabled'),
      disabled: t('Disabled'),
    },
  }
}

export function formatBoard(board, t = (x) => x) {
  if (board == null) return t('Unknown')
  return `${board.width}x${board.height}`
}

export function formatPlayers(black, white, t = (x) => x) {
  return `${black?.username || t('Black')} vs ${white?.username || t('White')}`
}

export function getSocketLabel(socket, t = (x) => x) {
  switch (socket?.status) {
    case 'authentication-sent':
      return t('Authentication sent')
    case 'authenticated':
      return t('Authenticated')
    case 'connected':
      return t('Connected')
    case 'connecting':
      return t('Connecting')
    case 'error':
      return socket.error || t('Connection error')
    default:
      return t('Disconnected')
  }
}
