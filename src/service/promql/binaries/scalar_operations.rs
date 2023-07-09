use datafusion::error::{DataFusionError, Result};
use promql_parser::parser::token;

/// Supported operation between two float type values.
pub fn scalar_binary_operations(token: u8, lhs: f64, rhs: f64, return_bool: bool) -> Result<f64> {
    let value = match token {
        token::T_ADD => lhs + rhs,
        token::T_SUB => lhs - rhs,
        token::T_MUL => lhs * rhs,
        token::T_DIV => lhs / rhs,
        token::T_POW => lhs.powf(rhs),
        token::T_MOD => lhs % rhs,
        token::T_EQLC => (lhs == rhs) as u32 as f64,
        token::T_NEQ => {
            let output = lhs != rhs;
            if return_bool {
                output as u32 as f64
            } else {
                if output {
                    lhs
                } else {
                    return Err(DataFusionError::Internal("This should be filtered".into()));
                }
            }
        }
        token::T_GTR => {
            let output = lhs > rhs;
            if return_bool {
                output as u32 as f64
            } else {
                if output {
                    lhs
                } else {
                    return Err(DataFusionError::Internal("This should be filtered".into()));
                }
            }
        }
        token::T_LSS => {
            let output = lhs < rhs;
            if return_bool {
                output as u32 as f64
            } else {
                if output {
                    lhs
                } else {
                    return Err(DataFusionError::Internal("This should be filtered".into()));
                }
            }
        }
        token::T_GTE => {
            let output = lhs >= rhs;
            if return_bool {
                output as u32 as f64
            } else {
                if output {
                    lhs
                } else {
                    return Err(DataFusionError::Internal("This should be filtered".into()));
                }
            }
        }
        token::T_LTE => {
            let output = lhs <= rhs;
            if return_bool {
                output as u32 as f64
            } else {
                if output {
                    lhs
                } else {
                    return Err(DataFusionError::Internal("This should be filtered".into()));
                }
            }
        }
        token::T_ATAN2 => lhs.atan2(rhs),
        _ => {
            return Err(DataFusionError::NotImplemented(format!(
                "Unsupported scalar operation: {:?} {:?} {:?}",
                token, lhs, rhs
            )))
        }
    };
    Ok(value)
}
