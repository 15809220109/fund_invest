#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基金投资日志验证脚本
验证所有计算指标的准确性
"""

import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any

# 配置常量
RELATIVE_ERROR_THRESHOLDS = {
    # 净值相关
    '净值': 0.000001,  # 考虑到净值精度要求高
    '持仓成本': 0.000001,
    
    # 份额相关
    '交易份额': 0.0001,  # 份额通常4位小数
    '持仓份额': 0.0001,
    
    # 金额相关（相对误差可以稍大）
    '交易金额': 0.0005,  # 0.05%
    '现金余额': 0.0005,
    '基金市值': 0.0005,
    '总资产': 0.0005,
    '当日盈亏': 0.001,  # 盈亏计算可能累积误差
    '持仓收益': 0.001,
    '当前周期总投入': 0.0005,
    '当前周期总卖出': 0.0005,
    '历史总投入': 0.0005,
    '历史总卖出': 0.0005,
    
    # 收益率相关（百分比）
    '持仓收益率': 0.01,  # 1%，因为是百分比单位
    '累计收益率': 0.01,
    
    # 默认阈值
    'default': 0.001  # 0.1%
}

# 极小值配置
EPSILON = 0.0001  # 份额小于此值视为0
NEGATIVE_CHECK_FIELDS = [  # 这些字段不允许为负
    '净值', '交易份额', '持仓份额', '交易金额', 
    '现金余额', '基金市值', '总资产', '持仓成本',
    '当前周期总投入', '当前周期总卖出',
    '历史总投入', '历史总卖出'
]

class InvestmentVerifier:
    def __init__(self, csv_file: str):
        """初始化验证器"""
        self.df = pd.read_csv(csv_file)
        self.errors = []
        
        # 初始状态
        self.initial_cash = 10000.0
        
    def is_close(self, actual: float, expected: float, field: str = None) -> bool:
        """检查两个值是否在允许误差范围内"""
        if pd.isna(actual) and pd.isna(expected):
            return True
        if pd.isna(actual) or pd.isna(expected):
            return False
            
        # 获取字段特定的阈值
        threshold = RELATIVE_ERROR_THRESHOLDS.get(field, RELATIVE_ERROR_THRESHOLDS['default'])
        
        # 处理期望或实际值为0的情况（优先检查）
        if expected == 0 or actual == 0:
            # 当一方为0时，直接检查绝对值是否小于阈值
            # 这里使用字段对应的误差阈值，保证精度
            return abs(actual - expected) <= threshold
            
        # 检查非微小负值（仅对严格禁止负值的字段）
        # 只有当实际值或期望值是明确的负数（小于-EPSILON）时才报错
        if field in NEGATIVE_CHECK_FIELDS:
            if (actual < -EPSILON) or (expected < -EPSILON):
                self.log_error(None, field, expected, actual, "发现非微小负值")
                return False
            
        # 常规相对误差检查
        return abs(actual - expected) <= threshold * abs(expected)
    
    def is_effectively_zero(self, value: float) -> bool:
        """检查数值是否可以视为0（用于份额判断）"""
        return abs(value) <= EPSILON
    
    def log_error(self, day: int, field: str, expected: float, actual: float, description: str = ""):
        """记录错误"""
        day_str = f"第{day}天 " if day is not None else ""
        error_msg = f"{day_str}{field}: 期望={expected:.4f}, 实际={actual:.4f}"
        if description:
            error_msg += f" ({description})"
        self.errors.append(error_msg)
        print(f"❌ {error_msg}")
    
    def verify_basic_calculations(self) -> None:
        """验证基础计算：现金余额、持仓份额、基金市值、总资产"""
        print("=== 验证基础计算 ===")
        
        cash_balance = self.initial_cash
        holding_shares = 0.0
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            operation = row['操作类型']
            amount = row['交易金额']
            shares = row['交易份额']
            nav = row['净值']
            
            # 更新现金余额和持仓份额
            if operation == '买入':
                cash_balance -= amount
                holding_shares += shares
            elif operation == '卖出':
                cash_balance += amount
                holding_shares -= shares
            
            # 计算基金市值和总资产
            fund_value = holding_shares * nav
            total_assets = cash_balance + fund_value
            
            # 验证现金余额
            if not self.is_close(cash_balance, row['现金余额'], "现金余额"):
                self.log_error(day, "现金余额", cash_balance, row['现金余额'])
            
            # 验证持仓份额
            if not self.is_close(holding_shares, row['持仓份额'], "持仓份额"):
                self.log_error(day, "持仓份额", holding_shares, row['持仓份额'])
            
            # 验证基金市值
            if not self.is_close(fund_value, row['基金市值'], "基金市值"):
                self.log_error(day, "基金市值", fund_value, row['基金市值'])
            
            # 验证总资产
            if not self.is_close(total_assets, row['总资产'], "总资产"):
                self.log_error(day, "总资产", total_assets, row['总资产'])
    
    def verify_daily_pnl(self) -> None:
        """验证当日盈亏"""
        print("\n=== 验证当日盈亏 ===")
        
        prev_nav = None
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            nav = row['净值']
            holding_shares = row['持仓份额']
            
            if prev_nav is None:
                # 首日无当日盈亏
                expected_pnl = 0.0
            else:
                # 当日盈亏 = 持仓份额×(当日净值−昨日净值)
                expected_pnl = holding_shares * (nav - prev_nav)
            
            if not self.is_close(expected_pnl, row['当日盈亏'], "当日盈亏"):
                self.log_error(day, "当日盈亏", expected_pnl, row['当日盈亏'])
            
            prev_nav = nav
    
    def verify_cumulative_amounts(self) -> None:
        """验证累计投入和卖出金额"""
        print("\n=== 验证累计投入和卖出 ===")
        
        # 当前周期累计
        current_invested = 0.0
        current_sold = 0.0
        
        # 历史累计
        historical_invested = 0.0
        historical_sold = 0.0
        
        prev_holding_shares = 0.0
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            operation = row['操作类型']
            amount = row['交易金额']
            holding_shares = row['持仓份额']
            
            # 检查是否是新周期开始（前一天清仓且今天买入）
            if i > 0 and self.is_effectively_zero(prev_holding_shares) and operation == '买入':
                # 新周期开始，重置当前周期
                current_invested = 0.0
                current_sold = 0.0
            
            # 更新累计金额
            if operation == '买入':
                current_invested += amount
                historical_invested += amount
            elif operation == '卖出':
                current_sold += amount
                historical_sold += amount
                
            # 检查清仓后重置：如果卖出后持仓份额为0，立即重置当前周期累计值
            if operation == '卖出' and self.is_effectively_zero(holding_shares):
                current_invested = 0.0
                current_sold = 0.0
            
            # 验证当前周期总投入
            if not self.is_close(current_invested, row['当前周期总投入'], "当前周期总投入"):
                self.log_error(day, "当前周期总投入", current_invested, row['当前周期总投入'])
            
            # 验证当前周期总卖出
            if not self.is_close(current_sold, row['当前周期总卖出'], "当前周期总卖出"):
                self.log_error(day, "当前周期总卖出", current_sold, row['当前周期总卖出'])
            
            # 验证历史总投入
            if not self.is_close(historical_invested, row['历史总投入'], "历史总投入"):
                self.log_error(day, "历史总投入", historical_invested, row['历史总投入'])
            
            # 验证历史总卖出
            if not self.is_close(historical_sold, row['历史总卖出'], "历史总卖出"):
                self.log_error(day, "历史总卖出", historical_sold, row['历史总卖出'])
            
            prev_holding_shares = holding_shares
    
    def verify_holding_cost(self) -> None:
        """验证持仓成本"""
        print("\n=== 验证持仓成本 ===")
        
        current_invested = 0.0
        current_sold = 0.0
        prev_holding_shares = 0.0
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            operation = row['操作类型']
            amount = row['交易金额']
            holding_shares = row['持仓份额']
            
            # 检查是否是新周期开始
            if i > 0 and self.is_effectively_zero(prev_holding_shares) and operation == '买入':
                current_invested = 0.0
                current_sold = 0.0
            
            # 更新当前周期累计
            if operation == '买入':
                current_invested += amount
            elif operation == '卖出':
                current_sold += amount
                
            # 检查清仓后重置：如果卖出后持仓份额为0，立即重置当前周期累计值
            if operation == '卖出' and self.is_effectively_zero(holding_shares):
                current_invested = 0.0
                current_sold = 0.0
            
            # 计算持仓成本
            if not self.is_effectively_zero(holding_shares):
                expected_cost = (current_invested - current_sold) / holding_shares
            else:
                expected_cost = 0.0
            
            if not self.is_close(expected_cost, row['持仓成本'], "持仓成本"):
                self.log_error(day, "持仓成本", expected_cost, row['持仓成本'])
            
            prev_holding_shares = holding_shares
    
    def verify_holding_metrics(self) -> None:
        """验证持仓收益和收益率"""
        print("\n=== 验证持仓收益和收益率 ===")
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            nav = row['净值']
            holding_shares = row['持仓份额']
            holding_cost = row['持仓成本']
            
            if holding_shares > 0 and holding_cost > 0:
                # 持仓收益 = 持仓份额 × (当日净值 - 持仓成本)
                expected_profit = holding_shares * (nav - holding_cost)
                
                # 持仓收益率 = (当前净值/持仓成本 - 1)×100%
                expected_yield = (nav / holding_cost - 1) * 100
            else:
                expected_profit = 0.0
                expected_yield = 0.0
            
            # 验证持仓收益
            if not self.is_close(expected_profit, row['持仓收益'], "持仓收益"):
                self.log_error(day, "持仓收益", expected_profit, row['持仓收益'])
            
            # 验证持仓收益率
            if not self.is_close(expected_yield, row['持仓收益率'], "持仓收益率"):
                self.log_error(day, "持仓收益率", expected_yield, row['持仓收益率'])
    
    def verify_cumulative_return(self) -> None:
        """验证累计收益率"""
        print("\n=== 验证累计收益率 ===")
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            fund_value = row['基金市值']
            historical_invested = row['历史总投入']
            historical_sold = row['历史总卖出']
            
            if historical_invested > 0:
                # 累计净收益 = (当前基金市值 + 历史卖出总金额) - 历史买入总金额
                cumulative_profit = (fund_value + historical_sold) - historical_invested
                
                # 累计收益率 = (累计净收益 / 历史买入总金额) × 100%
                expected_return = (cumulative_profit / historical_invested) * 100
            else:
                expected_return = 0.0
            
            if not self.is_close(expected_return, row['累计收益率'], "累计收益率"):
                self.log_error(day, "累计收益率", expected_return, row['累计收益率'])
    
    def verify_transaction_amounts(self) -> None:
        """验证交易金额和份额的一致性"""
        print("\n=== 验证交易金额和份额 ===")
        
        for i, row in self.df.iterrows():
            day = row['游戏天数']
            operation = row['操作类型']
            amount = row['交易金额']
            shares = row['交易份额']
            nav = row['净值']
            
            if operation in ['买入', '卖出']:
                # 验证交易金额 = 交易份额 × 净值
                expected_amount = shares * nav
                
                if not self.is_close(expected_amount, amount, "交易金额"):
                    self.log_error(day, f"{operation}金额", expected_amount, amount)
    
    def run_verification(self) -> None:
        """运行所有验证"""
        print("开始验证基金投资日志...")
        print(f"数据范围: {len(self.df)} 天")
        print("=" * 50)
        
        # 运行各项验证
        self.verify_basic_calculations()
        self.verify_daily_pnl()
        self.verify_cumulative_amounts()
        self.verify_holding_cost()
        self.verify_holding_metrics()
        self.verify_cumulative_return()
        self.verify_transaction_amounts()
        
        # 汇总结果
        print("\n" + "=" * 50)
        if self.errors:
            print(f"❌ 发现 {len(self.errors)} 个错误:")
            for error in self.errors:
                print(f"   {error}")
        else:
            print("✅ 所有验证通过！日志数据准确无误。")
        print("=" * 50)

def main():
    """主函数"""
    csv_file = "基金投资详细log.csv"
    
    try:
        verifier = InvestmentVerifier(csv_file)
        verifier.run_verification()
    except FileNotFoundError:
        print(f"❌ 错误: 找不到文件 {csv_file}")
    except Exception as e:
        print(f"❌ 错误: {str(e)}")

if __name__ == "__main__":
    main() 