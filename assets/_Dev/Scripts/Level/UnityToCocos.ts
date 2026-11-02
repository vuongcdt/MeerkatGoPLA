import { Vec3 } from 'cc';
import { Vec3Data } from './LevelData';

/**
 * Converts Unity (left-handed) transforms to Cocos (right-handed).
 * Unity mirrors the X axis when importing FBX, so mirroring X back keeps meshes and layout consistent:
 * position (x, y, z) -> (-x, y, z), euler (x, y, z) -> (x, -y, -z).
 */
export function toCocosPosition(p: Vec3Data, out: Vec3): Vec3 {
    return out.set(-p.x, p.y, p.z);
}

export function toCocosEuler(r: Vec3Data, out: Vec3): Vec3 {
    return out.set(r.x, -r.y, -r.z);
}

export function toCocosScale(s: Vec3Data, out: Vec3): Vec3 {
    return out.set(s.x, s.y, s.z);
}
