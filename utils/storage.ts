// utils/storage.ts

// Helper para gerar chaves com prefixo do evento
const getKey = (key: string, namespace: string) => `${namespace}:${key}`;

export function saveToStorage<T>(key: string, data: T, namespace: string = 'default'): void {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(getKey(key, namespace), serializedData);
  } catch (error) {
    console.error(`Erro ao salvar dados no localStorage (${key} [${namespace}]):`, error);
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T, namespace: string = 'default'): T {
  try {
    const serializedData = localStorage.getItem(getKey(key, namespace));
    if (serializedData === null) {
      return defaultValue;
    }
    // Adiciona uma verificação para garantir que a data seja um objeto Date válido após o parse
    const parsed = JSON.parse(serializedData, (k, value) => {
        if (k === 'date' && typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        return value;
    });
    return parsed;
  } catch (error) {
    console.error(`Erro ao carregar dados do localStorage (${key} [${namespace}]):`, error);
    return defaultValue;
  }
}

export function clearEventStorage(namespace: string): void {
  try {
    const prefix = `${namespace}:`;
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`Dados do evento '${namespace}' limpos.`);
  } catch (error) {
      console.error(`Erro ao limpar dados do evento ${namespace}:`, error);
  }
}