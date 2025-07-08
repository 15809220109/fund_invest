/**
 * 数据结构工具模块
 * 统一处理前端计算数据与标准用户数据之间的转换
 * 
 * 设计原则：
 * 1. 前端负责所有业务逻辑计算，云端只负责数据存储
 * 2. 标准数据结构与计算数据结构分离，方便维护
 * 3. 提供双向转换功能，确保数据一致性
 */

/**
 * 标准用户数据结构定义
 * 这是云端数据库中存储的格式
 */
const STANDARD_USER_SCHEMA = {
  // 1. 系统标识类字段
  _openid: '', // 用户唯一标识
  
  // 2. 时间记录类字段
  createTime: '', // 创建时间 ISO字符串
  lastLoginTime: '', // 最后登录时间 ISO字符串
  
  // 3. 游戏状态类字段
  currentIndex: 0, // 当前游戏进度索引
  initialIndex: 0, // 游戏开始索引
  
  // 4. 资金管理类字段
  totalAmount: 0, // 总资产（现金+基金市值）
  totalProfitRate: 0, // 累计收益率
  
  // 5. 基金投资类字段
  fundData: [
    {
      fundName: '', // 基金名称
      shares: 0, // 持仓份额
      transactions: [ // 交易记录
        {
          type: '', // 'buy' | 'sell'
          amount: 0, // 交易金额
          units: 0, // 交易份额
          price: 0, // 交易价格
          date: '', // 交易日期
          timestamp: '' // 交易时间戳
        }
      ]
    }
  ],
  
  // 6. 用户资料类字段
  profile: {
    avatar: '', // 头像URL
    nickname: '' // 昵称
  }
};

/**
 * 计算可用现金
 * @param {Object} userData - 标准格式的用户数据
 * @param {Array} indexData - 基金净值数据（可选）
 * @returns {number} 可用现金金额
 */
function calculateAvailableCash(userData, indexData = null) {
  if (!userData || !userData.fundData || userData.fundData.length === 0) {
    return userData?.totalAmount || 10000;
  }
  
  const fundInfo = userData.fundData[0];
  
  // 如果没有净值数据，无法准确计算
  if (!indexData || !userData.currentIndex) {
    return userData.totalAmount || 10000;
  }
  
  // 获取当前净值
  const currentNetValue = indexData[userData.currentIndex]?.netValue || 1;
  
  // 计算基金市值
  const fundValue = fundInfo.shares * currentNetValue;
  
  // 现金 = 总资产 - 基金市值
  const result = (userData.totalAmount || 10000) - fundValue;
  
  return result;
}

/**
 * 从标准用户数据中提取计算用数据
 * @param {Object} userData - 标准格式的用户数据
 * @param {Array} indexData - 基金净值数据（可选）
 * @returns {Object} 计算用的数据结构
 */
function extractCalculationData(userData, indexData = null) {
  const fundInfo = userData.fundData && userData.fundData.length > 0 
    ? userData.fundData[0] 
    : { shares: 0, transactions: [] };
    
  // 确保transactions是有效数据
  const safeTransactions = Array.isArray(fundInfo.transactions) ? fundInfo.transactions : [];
  
  // 计算现金 - 如果没有indexData，先使用用户数据中的直接字段，否则后续由GameStateManager重新计算
  let calculatedCash;
  if (indexData) {
    calculatedCash = calculateAvailableCash(userData, indexData);
  } else {
    // 没有净值数据时，暂时使用一个占位值，让GameStateManager.recalculateAll()来正确计算
    calculatedCash = userData.totalAmount || 10000; // 这个值会被recalculateAll覆盖
  }
  
  // 【修改】优先使用持久化的 cash 字段，只有在不存在时才使用反推值
  const finalCash = userData.cash !== undefined ? userData.cash : calculatedCash;
  const finalFundUnits = userData.fundUnits !== undefined ? userData.fundUnits : fundInfo.shares;
  
  const result = {
    // 基础状态
    currentIndex: userData.currentIndex,
    initialIndex: userData.initialIndex,
    
    // 资金信息（优先使用直接字段，否则动态计算）
    cash: finalCash,
    totalAmount: userData.totalAmount,
    totalProfitRate: userData.totalProfitRate,
    
    // 基金信息（优先使用直接字段）
    fundUnits: finalFundUnits,
    transactions: safeTransactions
  };
  
  return result;
}

/**
 * 更新标准数据结构中的基金信息
 * @param {Object} userData - 标准格式的用户数据
 * @param {Object} updateData - 需要更新的数据
 * @returns {Object} 更新后的用户数据
 */
function updateStandardUserData(userData, updateData) {
  const updated = { ...userData };
  
  // 更新资金管理类字段
  if (updateData.totalAmount !== undefined) {
    updated.totalAmount = updateData.totalAmount;
  }
  if (updateData.totalProfitRate !== undefined) {
    updated.totalProfitRate = updateData.totalProfitRate;
  }
  
  // 【新增】持久化 cash 字段（方案2）
  if (updateData.cash !== undefined) {
    updated.cash = updateData.cash;
  }
  
  // 更新游戏状态类字段
  if (updateData.currentIndex !== undefined) {
    updated.currentIndex = updateData.currentIndex;
  }
  
  // 更新基金投资类字段
  if (updateData.fundUnits !== undefined || updateData.transactions !== undefined) {
    if (!updated.fundData || updated.fundData.length === 0) {
      updated.fundData = [{
        fundName: '模拟基金',
        shares: 0,
        transactions: []
      }];
    }
    
    if (updateData.fundUnits !== undefined) {
      updated.fundData[0].shares = updateData.fundUnits;
    }
    if (updateData.transactions !== undefined) {
      updated.fundData[0].transactions = updateData.transactions;
    }
  }
  
  return updated;
}

/**
 * 验证数据结构是否符合标准格式
 * @param {Object} userData - 要验证的用户数据
 * @returns {Boolean} 是否符合标准格式
 */
function validateStandardFormat(userData) {
  if (!userData || typeof userData !== 'object') {
    return false;
  }
  
  // 检查必需的字段
  const requiredFields = [
    '_openid', 'createTime', 'lastLoginTime',
    'currentIndex', 'initialIndex',
    'totalAmount', 'totalProfitRate',
    'fundData', 'profile'
  ];
  
  for (const field of requiredFields) {
    if (!(field in userData)) {
      return false;
    }
  }
  
  // 检查fundData格式
  if (!Array.isArray(userData.fundData)) {
    return false;
  }
  
  // 检查profile格式
  if (!userData.profile || typeof userData.profile !== 'object') {
    return false;
  }
  
  return true;
}

/**
 * 统一的游戏初始状态创建函数
 * 用于 1. 新用户注册 2. 游戏重置
 * 基于第一性原理：前端负责所有业务逻辑，云端只负责数据存储
 */
function createInitialGameState() {
  const GAME_CONFIG = require('../config/gameConfig.js');
  const currentTime = new Date().toISOString();
  
  return {
    // 1. 系统标识类字段（_openid 由调用方添加）
    
    // 2. 时间记录类字段
    createTime: currentTime,
    lastLoginTime: currentTime,
    
    // 3. 游戏状态类字段
    currentIndex: GAME_CONFIG.INITIAL_INDEX,
    initialIndex: GAME_CONFIG.INITIAL_INDEX,
    
    // 4. 资金管理类字段
    totalAmount: GAME_CONFIG.INITIAL_CASH,
    totalProfitRate: 0,
    cash: GAME_CONFIG.INITIAL_CASH,
    
    // 5. 基金投资类字段
    fundData: [],
    
    // 6. 用户资料类字段
    profile: {
      avatar: '',
      nickname: ''
    }
  };
}

/**
 * 新用户数据创建（调用统一初始化函数）
 */
function createNewUserData() {
  return createInitialGameState();
}

/**
 * 游戏数据重置（调用统一初始化函数）
 */
function createResetGameData() {
  const resetData = createInitialGameState();
  
  // 重置时可以保留一些用户资料（可选）
  // 这里使用完全重置，如需保留资料可以在调用前获取现有profile
  
  return resetData;
}

module.exports = {
  STANDARD_USER_SCHEMA,
  calculateAvailableCash,
  extractCalculationData,
  updateStandardUserData,
  validateStandardFormat,
  createInitialGameState,
  createNewUserData,
  createResetGameData
}; 